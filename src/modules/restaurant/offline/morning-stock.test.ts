import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import {
  createOrder,
  currentMorningStock,
  morningProposals,
  saveMorningStock,
  type DeviceContext,
} from "./repository";

const manager: DeviceContext = {
  establishmentId: "test",
  userId: "manager",
  userName: "Gérant test",
  deviceId: "device-1",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};

// 20 h locales à Bukavu (UTC+2) : journée commencée à 6 h, soit 04:00 UTC.
const NOW = "2026-11-07T18:00:00.000Z";
const DAY_START = "2026-11-07T04:00:00.000Z";
const DAY = "2026-11-07";

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  db = new RestaurantDb(`test-${Math.random()}`);
  await ensureDemoData(db, manager);
});

afterEach(() => {
  vi.useRealTimers();
});

async function goatLines(quantity: number, reason = "") {
  return [{ menuItemId: "item-goat", quantity, reason }];
}

describe("stock du matin", () => {
  it("EF-REQ-04 : propose le reste théorique de la veille", async () => {
    const proposals = await morningProposals(db, manager, DAY_START);
    const yesterdaySold = (await db.invoices.where("createdAt").below(DAY_START).toArray()).flatMap(
      (invoice) => invoice.lines.filter((line) => line.menuItemId === "item-goat"),
    );
    const sold = yesterdaySold.reduce((sum, line) => sum + line.quantity, 0);
    expect(proposals.get("item-goat")).toBe(Math.max(0, 40 - sold));
  });

  it("EF-REQ-03 : enregistre la saisie de la grillade et met fin à l'alerte", async () => {
    const proposal = (await morningProposals(db, manager, DAY_START)).get("item-goat") ?? 0;
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: await goatLines(proposal),
    });
    const current = await currentMorningStock(db, DAY);
    expect(current.get("item-goat")?.quantity).toBe(proposal);
    expect(current.get("item-goat")?.reason).toBeNull();
  });

  it("RG-REQ-02 : refuse un écart sans motif", async () => {
    const proposal = (await morningProposals(db, manager, DAY_START)).get("item-goat") ?? 0;
    await expect(
      saveMorningStock(db, manager, {
        servicePointId: "sp-grill",
        lines: await goatLines(proposal + 30),
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });

  it("RG-REQ-02 : une correction garde la saisie précédente et exige un motif", async () => {
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: await goatLines(40, "Réquisition du jour"),
    });
    await expect(
      saveMorningStock(db, manager, { servicePointId: "sp-grill", lines: await goatLines(36) }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    vi.setSystemTime(new Date("2026-11-07T18:05:00.000Z"));
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: await goatLines(36, "Erreur de comptage"),
    });
    const entries = await db.morningStockEntries
      .where("[day+menuItemId]")
      .equals([DAY, "item-goat"])
      .toArray();
    expect(entries).toHaveLength(2);
    expect((await currentMorningStock(db, DAY)).get("item-goat")?.quantity).toBe(36);
    expect(entries.find((entry) => entry.quantity === 36)?.replacesId).toBe(
      entries.find((entry) => entry.quantity === 40)?.id,
    );
  });

  it("exige une quantité pour chaque élément vendable du poste", async () => {
    await expect(
      saveMorningStock(db, manager, { servicePointId: "sp-kitchen", lines: [] }),
    ).rejects.toMatchObject({ code: "QUANTITY_REQUIRED" });
  });

  it("place une opération dans la file d'envoi", async () => {
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: await goatLines(40, "Réquisition du jour"),
    });
    const operations = await db.outbox.toArray();
    expect(operations.at(-1)).toMatchObject({ type: "restaurant.morning-stock.entered" });
  });

  it("refuse la saisie à un serveur (matrice des droits)", async () => {
    await expect(
      saveMorningStock(
        db,
        { ...manager, role: "waiter" },
        { servicePointId: "sp-grill", lines: await goatLines(40, "Réquisition du jour") },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RG-RES-01 : la saisie limite ensuite les commandes au stock du jour", async () => {
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: await goatLines(0, "Pas de chèvre aujourd'hui"),
    });
    await expect(
      createOrder(db, manager, {
        mode: "takeaway",
        tableId: null,
        lines: [{ menuItemId: "item-goat", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "ITEM_SOLD_OUT" });
  });
});
