import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import {
  createOrder,
  createRequisition,
  morningProposals,
  saveMorningStock,
  stockCountDraft,
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
  // La démo saisit le comptoir et la cuisine ; la grillade reste à saisir.
  await ensureDemoData(db, manager);
});

afterEach(() => {
  vi.useRealTimers();
});

function goat(quantity: number) {
  return [{ menuItemId: "item-goat", quantity }];
}

describe("réquisitions (D-069)", () => {
  it("EF-REQ-04 : avant le stock du matin, la réquisition entre dans la proposition", async () => {
    const before = (await morningProposals(db, manager, DAY_START)).get("item-goat") ?? 0;
    const requisition = await createRequisition(db, manager, {
      servicePointId: "sp-grill",
      isReturn: false,
      lines: goat(30),
      comment: "",
    });
    expect(requisition.kind).toBe("main");
    expect(requisition.day).toBe(DAY);
    expect(requisition.number).toMatch(/^REQ-2026-D01-\d{6}$/);
    expect(requisition.lines).toEqual([
      { menuItemId: "item-goat", name: expect.any(String), unit: "piece", quantity: 30 },
    ]);
    expect((await morningProposals(db, manager, DAY_START)).get("item-goat")).toBe(before + 30);

    const queued = await db.outbox.toArray();
    expect(queued.map((operation) => operation.type)).toContain("restaurant.requisition.created");
  });

  it("après le stock du matin : complément, ajouté au stock attendu et remis en vente", async () => {
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: [{ menuItemId: "item-goat", quantity: 0, reason: "Rien reçu ce matin" }],
    });
    // La démo a déjà vendu de la chèvre aujourd'hui : le complément couvre ces ventes, plus 10.
    const soldToday =
      (await stockCountDraft(db, manager, "sp-grill", DAY)).find(
        (line) => line.menuItemId === "item-goat",
      )?.sold ?? 0;
    const requisition = await createRequisition(db, manager, {
      servicePointId: "sp-grill",
      isReturn: false,
      lines: goat(soldToday + 10),
      comment: "",
    });
    expect(requisition.kind).toBe("complement");

    const draft = await stockCountDraft(db, manager, "sp-grill", DAY);
    expect(draft.find((line) => line.menuItemId === "item-goat")).toMatchObject({
      morning: 0,
      requisitioned: soldToday + 10,
    });
    // RG-RES-01 : le stock du matin (0) seul aurait refusé la commande.
    await expect(
      createOrder(db, manager, {
        mode: "takeaway",
        tableId: null,
        lines: [{ menuItemId: "item-goat", quantity: 2 }],
      }),
    ).resolves.toBeDefined();
  });

  it("un retour au magasin exige un motif et retire du stock attendu", async () => {
    await saveMorningStock(db, manager, {
      servicePointId: "sp-grill",
      lines: [{ menuItemId: "item-goat", quantity: 20, reason: "Comptage du matin" }],
    });
    await expect(
      createRequisition(db, manager, {
        servicePointId: "sp-grill",
        isReturn: true,
        lines: goat(5),
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    const returned = await createRequisition(db, manager, {
      servicePointId: "sp-grill",
      isReturn: true,
      lines: goat(5),
      comment: "Surplus rendu",
    });
    expect(returned.kind).toBe("return");
    const draft = await stockCountDraft(db, manager, "sp-grill", DAY);
    expect(draft.find((line) => line.menuItemId === "item-goat")?.requisitioned).toBe(-5);
  });

  it("refuse un élément d'un autre poste, une réquisition vide et un serveur", async () => {
    await expect(
      createRequisition(db, manager, {
        servicePointId: "sp-grill",
        isReturn: false,
        lines: [{ menuItemId: "item-primus", quantity: 12 }],
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    await expect(
      createRequisition(db, manager, {
        servicePointId: "sp-grill",
        isReturn: false,
        lines: goat(0),
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "EMPTY_REQUISITION" });
    await expect(
      createRequisition(
        db,
        { ...manager, role: "waiter" },
        { servicePointId: "sp-grill", isReturn: false, lines: goat(5), comment: "" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
