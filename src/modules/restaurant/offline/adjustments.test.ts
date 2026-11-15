import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { invoiceBalances } from "../domain/payment";
import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import {
  createOrder,
  decideAdjustment,
  recordPayment,
  requestAdjustment,
  soldQuantitiesBetween,
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
const otherWaiter: DeviceContext = { ...waiter, userId: "w2", userName: "Neema" };
const fc = (major: number) => moneyFromMajor(major, "CDF");

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  const createdAt = "2026-11-01T06:00:00.000Z";
  await db.servicePoints.bulkPut([
    {
      id: "sp-counter",
      establishmentId: "test",
      kind: "counter",
      name: "Comptoir",
      menu: "drinks",
      sortOrder: 1,
    },
    {
      id: "sp-kitchen",
      establishmentId: "test",
      kind: "kitchen",
      name: "Cuisine",
      menu: "food",
      sortOrder: 2,
    },
  ]);
  await db.menuItems.bulkPut([
    {
      id: "item-primus",
      establishmentId: "test",
      servicePointId: "sp-counter",
      name: "Primus 72 cl",
      description: "",
      category: "Bières",
      unit: "bottle",
      price: fc(3_500),
      createdAt,
      archivedAt: null,
    },
    {
      id: "item-tilapia",
      establishmentId: "test",
      servicePointId: "sp-kitchen",
      name: "Tilapia",
      description: "",
      category: "Poissons",
      unit: "dish",
      price: fc(15_000),
      createdAt,
      archivedAt: null,
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Commande de 22 000 FC : 2 Primus (7 000) et un tilapia (15 000). */
async function order(ctx: DeviceContext = waiter) {
  return createOrder(db, ctx, {
    mode: "takeaway",
    tableId: null,
    lines: [
      { menuItemId: "item-primus", quantity: 2 },
      { menuItemId: "item-tilapia", quantity: 1 },
    ],
  });
}

describe("annulation (RG-CMD-02, RG-VTE-02)", () => {
  it("le serveur demande, le gérant valide : factures annulées, stock rétabli", async () => {
    const { order: created, invoices } = await order();
    const { request, decision } = await requestAdjustment(db, waiter, {
      kind: "cancel",
      orderId: created.id,
      reason: "Client parti avant d'être servi",
    });
    expect(decision).toBeNull();
    expect((await db.invoices.get(invoices[0]?.id ?? ""))?.paymentStatus).toBe("unpaid");
    await expect(
      decideAdjustment(db, waiter, { requestId: request.id, approved: true, comment: "" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await decideAdjustment(db, manager, { requestId: request.id, approved: true, comment: "" });
    const cancelled = await db.invoices.bulkGet(invoices.map((invoice) => invoice.id));
    expect(cancelled.map((invoice) => invoice?.paymentStatus)).toEqual(["cancelled", "cancelled"]);
    expect(cancelled[0]?.cancelReason).toBe("Client parti avant d'être servi");
    // La facture garde son numéro (RG-DOC-01) et ne compte plus dans les ventes.
    expect(cancelled[0]?.number).toBe(invoices[0]?.number);
    const sold = await soldQuantitiesBetween(
      db,
      "2026-11-07T04:00:00.000Z",
      "2026-11-08T04:00:00.000Z",
    );
    expect(sold.get("item-primus") ?? 0).toBe(0);
    const types = (await db.outbox.toArray()).map((operation) => operation.type);
    expect(types).toEqual(
      expect.arrayContaining(["restaurant.adjustment.requested", "restaurant.adjustment.decided"]),
    );
  });

  it("refuse une demande en double, sur la commande d'un autre, ou une facture encaissée", async () => {
    const { order: created, invoices } = await order();
    await requestAdjustment(db, waiter, { kind: "cancel", orderId: created.id, reason: "Erreur" });
    await expect(
      requestAdjustment(db, waiter, { kind: "cancel", orderId: created.id, reason: "Erreur" }),
    ).rejects.toMatchObject({ code: "REQUEST_PENDING" });
    await expect(
      requestAdjustment(db, otherWaiter, { kind: "cancel", orderId: created.id, reason: "Erreur" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const paid = await order();
    await recordPayment(db, waiter, {
      invoiceIds: paid.invoices.map((invoice) => invoice.id),
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 5_000,
    });
    await expect(
      requestAdjustment(db, waiter, { kind: "cancel", orderId: paid.order.id, reason: "Erreur" }),
    ).rejects.toMatchObject({ code: "ALREADY_PAID" });
    expect(invoices).toHaveLength(2);
  });

  it("un refus s'explique et ne change rien", async () => {
    const { order: created, invoices } = await order();
    const { request } = await requestAdjustment(db, waiter, {
      kind: "cancel",
      orderId: created.id,
      reason: "Erreur de saisie",
    });
    await expect(
      decideAdjustment(db, manager, { requestId: request.id, approved: false, comment: "" }),
    ).rejects.toMatchObject({ code: "COMMENT_REQUIRED" });
    await decideAdjustment(db, manager, {
      requestId: request.id,
      approved: false,
      comment: "Les plats sont déjà servis",
    });
    expect((await db.invoices.get(invoices[0]?.id ?? ""))?.paymentStatus).toBe("unpaid");
    await expect(
      decideAdjustment(db, manager, { requestId: request.id, approved: true, comment: "" }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });
});

describe("remise (RG-ENC-01)", () => {
  it("le gérant qui agit lui-même valide dans le même geste ; la remise réduit le reste à payer", async () => {
    const { order: created, invoices } = await order();
    const { decision } = await requestAdjustment(db, manager, {
      kind: "discount",
      orderId: created.id,
      reason: "Client fidèle",
      discountMajor: 2_200,
    });
    expect(decision?.approved).toBe(true);
    // Même milliseconde (horloge figée) : l'ordre de lecture des factures varie.
    const shareOf = (invoiceId: string | undefined) =>
      decision?.discounts.find((share) => share.invoiceId === invoiceId)?.amount;
    expect(shareOf(invoices[0]?.id)).toEqual(fc(700));
    expect(shareOf(invoices[1]?.id)).toEqual(fc(1_500));
    const updated = await db.invoices.bulkGet(invoices.map((invoice) => invoice.id));
    const balances = invoiceBalances(
      updated.filter((invoice) => invoice !== undefined),
      [],
    );
    expect([...balances.values()].map((balance) => balance.remaining)).toEqual([
      fc(6_300),
      fc(13_500),
    ]);
    // Le client règle le reste : 19 800 FC soldent la commande.
    await recordPayment(db, manager, {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 19_800,
    });
    const after = invoiceBalances(
      (await db.invoices.bulkGet(invoices.map((invoice) => invoice.id))).filter(
        (invoice) => invoice !== undefined,
      ),
      await db.payments.toArray(),
    );
    expect([...after.values()].every((balance) => balance.status === "paid")).toBe(true);
  });

  it("refuse une remise supérieure au reste à payer", async () => {
    const { order: created } = await order();
    await expect(
      requestAdjustment(db, waiter, {
        kind: "discount",
        orderId: created.id,
        reason: "Geste commercial",
        discountMajor: 30_000,
      }),
    ).rejects.toMatchObject({ code: "MORE_THAN_DUE" });
  });
});
