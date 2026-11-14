import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { invoiceBalances } from "../domain/payment";
import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import {
  addExchangeRate,
  createOrder,
  currentExchangeRate,
  recordPayment,
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

/** Commande de 22 000 FC : 2 Primus (comptoir) et un tilapia (cuisine). */
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

async function balances() {
  return invoiceBalances(await db.invoices.toArray(), await db.payments.toArray());
}

describe("taux du dollar (EF-PRX-05, RG-PRX-02, D-042)", () => {
  it("ajoute un taux sans jamais modifier les précédents", async () => {
    await addExchangeRate(db, manager, "2 800", { effectiveAt: "2026-11-07T07:00:00.000Z" });
    await addExchangeRate(db, manager, "2850", { effectiveAt: "2026-11-07T09:00:00.000Z" });
    expect((await currentExchangeRate(db))?.rate).toBe("2850");
    expect(await db.exchangeRates.count()).toBe(2);
    expect((await db.outbox.toArray()).at(-1)).toMatchObject({
      type: "restaurant.exchange-rate.added",
    });
  });

  it("réserve la saisie du taux au gérant et refuse un taux illisible", async () => {
    await expect(addExchangeRate(db, waiter, "2850")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addExchangeRate(db, manager, "deux mille")).rejects.toMatchObject({
      code: "INVALID_RATE",
    });
  });
});

describe("encaissement (EF-ENC-02, D-032, D-033)", () => {
  it("encaisse une commande en francs et solde ses deux factures", async () => {
    const { invoices } = await order();
    const payment = await recordPayment(db, waiter, {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 25_000,
    });
    expect(payment.change).toEqual(fc(3_000));
    expect(payment.collectedBy).toBe("w1");
    const result = await balances();
    expect(invoices.map((invoice) => result.get(invoice.id)?.status)).toEqual(["paid", "paid"]);
    // Même milliseconde (horloge figée) : l'ordre des identifiants n'est pas garanti.
    const operation = (await db.outbox.toArray()).find(
      (entry) => entry.type === "restaurant.payment.recorded",
    );
    expect(operation?.payload).toMatchObject({
      payment: { changeMinor: 300_000, tendered: { amountMinor: 2_500_000, currency: "CDF" } },
    });
  });

  it("accepte un paiement partiel, puis le solde en dollars au taux du jour", async () => {
    await addExchangeRate(db, manager, "2850", { effectiveAt: "2026-11-07T07:00:00.000Z" });
    const { invoices } = await order();
    const ids = invoices.map((invoice) => invoice.id);
    await recordPayment(db, waiter, {
      invoiceIds: ids,
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 5_000,
    });
    // Comptoir (7 000 FC) d'abord : 5 000 versés, il reste 2 000 + 15 000.
    const afterFirst = await balances();
    expect(ids.map((id) => afterFirst.get(id)?.status)).toEqual(["partial", "unpaid"]);
    vi.setSystemTime(new Date("2026-11-07T18:30:00.000Z"));
    const dollars = await recordPayment(db, waiter, {
      invoiceIds: ids,
      method: "cash",
      provider: null,
      reference: null,
      currency: "USD",
      amountMajor: 10,
    });
    expect(dollars.rate?.rate).toBe("2850");
    expect(dollars.baseAmount).toEqual(fc(28_500));
    expect(dollars.change).toEqual(fc(11_500));
    expect([...(await balances()).values()].every((balance) => balance.status === "paid")).toBe(
      true,
    );
  });

  it("refuse les dollars sans taux, et la monnaie sur Mobile Money", async () => {
    const { invoices } = await order();
    const ids = invoices.map((invoice) => invoice.id);
    await expect(
      recordPayment(db, waiter, {
        invoiceIds: ids,
        method: "cash",
        provider: null,
        reference: null,
        currency: "USD",
        amountMajor: 10,
      }),
    ).rejects.toMatchObject({ code: "RATE_REQUIRED" });
    await expect(
      recordPayment(db, waiter, {
        invoiceIds: ids,
        method: "mobile-money",
        provider: "mpesa",
        reference: "MP123",
        currency: "CDF",
        amountMajor: 30_000,
      }),
    ).rejects.toMatchObject({ code: "MORE_THAN_DUE" });
    await expect(
      recordPayment(db, waiter, {
        invoiceIds: ids,
        method: "mobile-money",
        provider: null,
        reference: null,
        currency: "CDF",
        amountMajor: 22_000,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PAYMENT" });
  });

  it("un serveur n'encaisse que ses ventes ; un gérant encaisse à sa place", async () => {
    const { invoices } = await order(otherWaiter);
    const input = {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash" as const,
      provider: null,
      reference: null,
      currency: "CDF" as const,
      amountMajor: 22_000,
    };
    await expect(recordPayment(db, waiter, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const payment = await recordPayment(db, manager, input);
    expect(payment.collectedBy).toBe("manager");
  });

  it("refuse d'encaisser des factures déjà soldées", async () => {
    const { invoices } = await order();
    const input = {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash" as const,
      provider: null,
      reference: null,
      currency: "CDF" as const,
      amountMajor: 22_000,
    };
    await recordPayment(db, waiter, input);
    await expect(recordPayment(db, waiter, input)).rejects.toMatchObject({ code: "NOTHING_DUE" });
  });
});
