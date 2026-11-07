import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import { createOrder, type DeviceContext } from "./repository";

const ctx: DeviceContext = {
  establishmentId: "test",
  userId: "u1",
  userName: "Serveur test",
  deviceId: "device-1",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};

let db: RestaurantDb;

beforeEach(async () => {
  // 20 h locales à Bukavu : la journée de démonstration est bien remplie.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  await ensureDemoData(db, ctx);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createOrder", () => {
  it("EF-CMD-02 : crée une facture d'avance numérotée par point de service", async () => {
    const { order, invoices } = await createOrder(db, ctx, {
      mode: "dine-in",
      tableId: "table-3",
      lines: [
        { menuItemId: "item-primus", quantity: 2 },
        { menuItemId: "item-fries", quantity: 1 },
        { menuItemId: "item-goat", quantity: 3 },
      ],
    });
    expect(invoices.map((i) => i.servicePointId)).toEqual(["sp-counter", "sp-kitchen", "sp-grill"]);
    expect(new Set(invoices.map((i) => i.number)).size).toBe(3);
    expect(invoices[0]?.number).toMatch(/^FAC-2026-D01-\d{6}$/);
    expect(order.tableLabel).toBe("Table 3");
    expect(order.total.amountMinor).toBe(
      invoices.reduce((sum, invoice) => sum + invoice.total.amountMinor, 0),
    );
  });

  it("RG-OFF-01 : place une opération dans la file d'envoi", async () => {
    const before = await db.outbox.count();
    await createOrder(db, ctx, {
      mode: "takeaway",
      tableId: null,
      lines: [{ menuItemId: "item-water", quantity: 1 }],
    });
    const operations = await db.outbox.toArray();
    expect(operations).toHaveLength(before + 1);
    expect(operations.at(-1)).toMatchObject({
      type: "restaurant.order.created",
      status: "pending",
    });
  });

  it("RG-REQ-03 : accepte un élément dont le stock du matin n'est pas saisi", async () => {
    const { invoices } = await createOrder(db, ctx, {
      mode: "takeaway",
      tableId: null,
      lines: [{ menuItemId: "item-goat", quantity: 2 }],
    });
    expect(invoices).toHaveLength(1);
  });

  it("RG-PRX-01 : refuse un élément sans prix", async () => {
    await expect(
      createOrder(db, ctx, {
        mode: "takeaway",
        tableId: null,
        lines: [{ menuItemId: "item-wine", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRICE_NOT_SET" });
  });

  it("RG-RES-01 : refuse une quantité supérieure au stock du jour", async () => {
    await expect(
      createOrder(db, ctx, {
        mode: "takeaway",
        tableId: null,
        lines: [{ menuItemId: "item-zingaro", quantity: 99 }],
      }),
    ).rejects.toMatchObject({ code: "ITEM_SOLD_OUT" });
  });

  it("refuse une commande en salle sans table", async () => {
    await expect(
      createOrder(db, ctx, {
        mode: "dine-in",
        tableId: null,
        lines: [{ menuItemId: "item-water", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER" });
  });
});

describe("données de démonstration", () => {
  it("couvrent les trois points de service sans créer d'opération à envoyer", async () => {
    const points = new Set((await db.invoices.toArray()).map((i) => i.servicePointId));
    expect(points).toEqual(new Set(["sp-counter", "sp-kitchen", "sp-grill"]));
    expect(await db.outbox.count()).toBe(0);
  });

  it("un double appel simultané ne duplique pas les données", async () => {
    const other = new RestaurantDb(`test-${Math.random()}`);
    await Promise.all([ensureDemoData(other, ctx), ensureDemoData(other, ctx)]);
    expect(await other.orders.count()).toBe(await db.orders.count());
  });
});
