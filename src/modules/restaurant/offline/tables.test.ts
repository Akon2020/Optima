import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tableSessions } from "../domain/tables";
import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import {
  addTable,
  createOrder,
  releaseTable,
  renameTable,
  setTableArchived,
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
const waiter: DeviceContext = { ...manager, userId: "w1", userName: "Amani", role: "waiter" };
const DAY_START = "2026-11-07T04:00:00.000Z";

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  await ensureDemoData(db, manager);
});

afterEach(() => {
  vi.useRealTimers();
});

async function sessions() {
  return tableSessions({
    orders: await db.orders.toArray(),
    invoices: await db.invoices.toArray(),
    releases: await db.tableReleases.toArray(),
    dayStart: DAY_START,
    currency: "CDF",
  });
}

describe("gestion des tables (EF-RES-04)", () => {
  it("ajoute une table numérotée à la suite", async () => {
    const table = await addTable(db, manager);
    expect(table.label).toBe("Table 13");
  });

  it("refuse un doublon et un serveur qui veut gérer les tables", async () => {
    await expect(addTable(db, manager, "table 3")).rejects.toMatchObject({
      code: "INVALID_TABLE_LABEL",
    });
    await expect(addTable(db, waiter)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("renomme une table sans toucher aux commandes passées", async () => {
    const before = (await db.orders.toArray()).find((order) => order.tableId === "table-1");
    await renameTable(db, manager, "table-1", "Terrasse 1");
    expect((await db.diningTables.get("table-1"))?.label).toBe("Terrasse 1");
    if (before) expect((await db.orders.get(before.id))?.tableLabel).toBe(before.tableLabel);
  });

  it("archive une table libre, refuse une table occupée, et la rétablit", async () => {
    await expect(
      setTableArchived(db, manager, "table-2", true, { isOccupied: true }),
    ).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
    await setTableArchived(db, manager, "table-2", true, { isOccupied: false });
    expect((await db.diningTables.get("table-2"))?.archivedAt).not.toBeNull();
    await expect(
      createOrder(db, waiter, {
        mode: "dine-in",
        tableId: "table-2",
        lines: [{ menuItemId: "item-water", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "TABLE_ARCHIVED" });
    await setTableArchived(db, manager, "table-2", false, { isOccupied: false });
    expect((await db.diningTables.get("table-2"))?.archivedAt).toBeNull();
  });
});

describe("occupation et libération (HYPOTHÈSE D-Q04)", () => {
  it("EF-CMD-04 : une nouvelle commande sur une table occupée la complète", async () => {
    await releaseTable(db, waiter, "table-5");
    vi.setSystemTime(new Date("2026-11-07T18:01:00.000Z"));
    const first = await createOrder(db, waiter, {
      mode: "dine-in",
      tableId: "table-5",
      lines: [{ menuItemId: "item-water", quantity: 1 }],
    });
    vi.setSystemTime(new Date("2026-11-07T18:02:00.000Z"));
    const second = await createOrder(db, waiter, {
      mode: "dine-in",
      tableId: "table-5",
      lines: [{ menuItemId: "item-fries", quantity: 1 }],
    });
    const session = (await sessions()).get("table-5");
    expect(session?.orders.map((o) => o.id)).toEqual([first.order.id, second.order.id]);
  });

  it("un serveur peut libérer une table : elle n'a plus d'occupation", async () => {
    await createOrder(db, waiter, {
      mode: "dine-in",
      tableId: "table-6",
      lines: [{ menuItemId: "item-water", quantity: 1 }],
    });
    vi.setSystemTime(new Date("2026-11-07T18:05:00.000Z"));
    await releaseTable(db, waiter, "table-6");
    expect((await sessions()).has("table-6")).toBe(false);
    expect((await db.outbox.toArray()).at(-1)).toMatchObject({ type: "restaurant.table.released" });
  });
});
