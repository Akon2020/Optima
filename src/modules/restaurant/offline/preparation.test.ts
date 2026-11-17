import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import {
  createOrder,
  setInvoicePrepStatus,
  setItemSoldOut,
  type DeviceContext,
} from "./repository";

const manager: DeviceContext = {
  establishmentId: "test",
  userId: "u1",
  userName: "Gérant test",
  deviceId: "device-1",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};
const cook: DeviceContext = { ...manager, userId: "cook", userName: "Cuisinier", role: "prep" };
const waiter: DeviceContext = { ...manager, userId: "w1", userName: "Amani", role: "waiter" };

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  await ensureDemoData(db, manager);
  // Le cuisinier est affecté à la cuisine (matrice : « son poste »).
  await db.staff.put({
    id: "cook",
    establishmentId: "test",
    name: "Cuisinier",
    role: "prep",
    servicePointId: "sp-kitchen",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const order = (menuItemId: string) =>
  createOrder(db, waiter, {
    mode: "takeaway",
    tableId: null,
    lines: [{ menuItemId, quantity: 1 }],
  });

describe("postes de préparation (EF-PRE-02, EF-PRE-03, D-066)", () => {
  it("EF-PRE-03 : un élément déclaré épuisé ne se commande plus, jusqu'à sa remise en vente", async () => {
    await expect(setItemSoldOut(db, waiter, "item-fries", true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Le cuisinier ne touche pas aux boissons du comptoir.
    await expect(setItemSoldOut(db, cook, "item-primus", true)).rejects.toMatchObject({
      code: "NOT_YOUR_STATION",
    });

    const item = await setItemSoldOut(db, cook, "item-fries", true);
    expect(item.soldOutDay).toBe("2026-11-07");
    await expect(order("item-fries")).rejects.toMatchObject({ code: "ITEM_SOLD_OUT" });
    expect(
      (await db.outbox.toArray()).some((op) => op.type === "restaurant.menu-item.sold-out-set"),
    ).toBe(true);

    await setItemSoldOut(db, manager, "item-fries", false);
    await expect(order("item-fries")).resolves.toBeDefined();
  });

  it("EF-PRE-02 : le préparateur marque prêtes les commandes de son poste seulement", async () => {
    const kitchen = (await order("item-fries")).invoices[0];
    const counter = (await order("item-primus")).invoices[0];
    if (!kitchen || !counter) throw new Error("factures attendues");

    await setInvoicePrepStatus(db, cook, kitchen.id, "ready");
    expect((await db.invoices.get(kitchen.id))?.prepStatus).toBe("ready");
    await expect(setInvoicePrepStatus(db, cook, counter.id, "ready")).rejects.toMatchObject({
      code: "NOT_YOUR_STATION",
    });
  });
});
