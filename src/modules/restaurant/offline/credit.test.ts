import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { customerDebts, outstandingOf } from "../domain/customers";
import { invoiceBalances } from "../domain/payment";
import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import {
  cashClosingDraft,
  createCustomer,
  createOrder,
  decideAdjustment,
  recordPayment,
  requestAdjustment,
  setCustomerCreditLimit,
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
const fc = (major: number) => moneyFromMajor(major, "CDF");

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  await db.servicePoints.put({
    id: "sp-kitchen",
    establishmentId: "test",
    kind: "kitchen",
    name: "Cuisine",
    menu: "food",
    sortOrder: 1,
  });
  await db.menuItems.put({
    id: "item-tilapia",
    establishmentId: "test",
    servicePointId: "sp-kitchen",
    name: "Tilapia",
    description: "",
    category: "Poissons",
    unit: "dish",
    price: fc(11_000),
    createdAt: "2026-11-01T06:00:00.000Z",
    archivedAt: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Commande de 22 000 FC (deux tilapias). */
async function order() {
  return createOrder(db, waiter, {
    mode: "takeaway",
    tableId: null,
    lines: [{ menuItemId: "item-tilapia", quantity: 2 }],
  });
}

async function debts() {
  const invoices = await db.invoices.toArray();
  return customerDebts({
    requests: await db.adjustmentRequests.toArray(),
    decisions: await db.adjustmentDecisions.toArray(),
    invoices,
    balances: invoiceBalances(invoices, await db.payments.toArray()),
    currency: "CDF",
  });
}

describe("fiches clients (EF-ENC-03, D-043)", () => {
  it("exige un nom et un téléphone, unique dans l'établissement", async () => {
    const rose = await createCustomer(db, waiter, {
      name: "Maman Rose",
      phone: "+243 99 123 45 67",
    });
    expect(rose.phone).toBe("+243991234567");
    await expect(
      createCustomer(db, waiter, { name: "Rose bis", phone: "+243991234567" }),
    ).rejects.toMatchObject({ code: "PHONE_TAKEN" });
    await expect(setCustomerCreditLimit(db, waiter, rose.id, 50_000)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("vente à crédit (EF-ENC-03, EF-VTE-05, RG-ENC-02, D-059)", () => {
  it("le gérant valide : le reste devient une dette client, plus un impayé du serveur", async () => {
    const rose = await createCustomer(db, waiter, { name: "Maman Rose", phone: "0991234567" });
    const { order: created, invoices } = await order();
    expect((await cashClosingDraft(db, waiter)).unpaidInvoiceIds).toHaveLength(1);

    await expect(
      requestAdjustment(db, waiter, { kind: "credit", orderId: created.id, reason: "Crédit" }),
    ).rejects.toMatchObject({ code: "CUSTOMER_REQUIRED" });
    const { request } = await requestAdjustment(db, waiter, {
      kind: "credit",
      orderId: created.id,
      reason: "Cliente habituelle",
      customerId: rose.id,
    });
    await decideAdjustment(db, manager, { requestId: request.id, approved: true, comment: "" });

    const invoice = await db.invoices.get(invoices[0]?.id ?? "");
    expect(invoice).toMatchObject({ creditRequestId: request.id, credited: fc(22_000) });
    expect((await cashClosingDraft(db, waiter)).unpaidInvoiceIds).toEqual([]);
    expect(outstandingOf(rose.id, await debts(), "CDF")).toEqual(fc(22_000));

    // EF-TRE-03 : un remboursement partiel s'encaisse et réduit la dette.
    await recordPayment(db, manager, {
      invoiceIds: invoices.map((entry) => entry.id),
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 10_000,
    });
    expect(outstandingOf(rose.id, await debts(), "CDF")).toEqual(fc(12_000));
    await expect(
      requestAdjustment(db, waiter, {
        kind: "credit",
        orderId: created.id,
        reason: "Encore",
        customerId: rose.id,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_CREDITED" });
  });

  it("D-037 : refuse un crédit qui dépasse le plafond du client", async () => {
    const rose = await createCustomer(db, waiter, { name: "Maman Rose", phone: "0991234567" });
    await setCustomerCreditLimit(db, manager, rose.id, 30_000);
    const first = await order();
    await requestAdjustment(db, manager, {
      kind: "credit",
      orderId: first.order.id,
      reason: "Crédit",
      customerId: rose.id,
    });
    const second = await order();
    await expect(
      requestAdjustment(db, waiter, {
        kind: "credit",
        orderId: second.order.id,
        reason: "Crédit",
        customerId: rose.id,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_LIMIT" });
  });
});
