import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import {
  assignDelivery,
  createOrder,
  recordPayment,
  saveDeliveryZone,
  setDeliveryStatus,
  setDeliveryZoneArchived,
  settleFailedDelivery,
  stockCountDraft,
  type DeviceContext,
} from "./repository";

const manager: DeviceContext = {
  establishmentId: "test",
  userId: "staff-manager",
  userName: "Gérant test",
  deviceId: "device-1",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};
const waiter: DeviceContext = {
  ...manager,
  userId: "staff-waiter-1",
  userName: "Amani",
  role: "waiter",
};
const courier: DeviceContext = {
  ...manager,
  userId: "staff-courier-1",
  userName: "Jean L.",
  role: "courier",
};
const otherCourier: DeviceContext = { ...courier, userId: "staff-courier-2", userName: "Paul" };

// 20 h locales à Bukavu (UTC+2) : journée commencée à 6 h, soit 04:00 UTC.
const NOW = "2026-11-07T18:00:00.000Z";

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  db = new RestaurantDb(`test-${Math.random()}`);
  await ensureDemoData(db, manager);
  await db.staff.put({
    id: otherCourier.userId,
    establishmentId: "test",
    name: "Paul",
    role: "courier",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function zoneId(name = "Nord") {
  const zone = (await db.deliveryZones.toArray()).find((entry) => entry.name === name);
  if (!zone) throw new Error(`zone ${name} attendue`);
  return zone.id;
}

async function deliveryOrder(details: Partial<{ zoneId: string; phone: string }> = {}) {
  return createOrder(db, waiter, {
    mode: "delivery",
    tableId: null,
    lines: [{ menuItemId: "item-coca", quantity: 2 }],
    delivery: {
      customerName: "Neema",
      phone: details.phone ?? "+243 990 000 001",
      address: "Avenue des Écoles 12",
      zoneId: details.zoneId ?? (await zoneId()),
      desiredTime: "19:30",
    },
  });
}

describe("livraison (EF-LIV-01 à 04, D-070, D-071)", () => {
  it("EF-LIV-01 : la commande porte la livraison et une facture de frais à part", async () => {
    const { order, invoices } = await deliveryOrder();
    const fee = invoices.find((invoice) => invoice.servicePointId === null);
    expect(fee).toMatchObject({ lines: [], prepStatus: "served", total: { amountMinor: 300_000 } });
    const lines = invoices.filter((invoice) => invoice.servicePointId !== null);
    const linesTotal = lines.reduce((sum, invoice) => sum + invoice.total.amountMinor, 0);
    expect(order.total.amountMinor).toBe(linesTotal + 300_000);

    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    expect(delivery).toMatchObject({
      customerName: "Neema",
      phone: "+243990000001",
      zoneName: "Nord",
      fee: { amountMinor: 300_000 },
      feeInvoiceId: fee?.id,
      desiredTime: "19:30",
      status: "preparing",
      courierId: null,
    });

    const operation = (await db.outbox.toArray()).find(
      (entry) =>
        entry.type === "restaurant.order.created" &&
        entry.payload &&
        JSON.stringify(entry.payload).includes(order.id),
    );
    const payload = operation?.payload as {
      invoices: { servicePointId: string }[];
      delivery?: { feeInvoice: { id: string } };
    };
    expect(payload.invoices.every((invoice) => invoice.servicePointId)).toBe(true);
    expect(payload.delivery?.feeInvoice.id).toBe(fee?.id);
  });

  it("refuse une livraison sans coordonnées ou dans une zone retirée", async () => {
    await expect(
      createOrder(db, waiter, {
        mode: "delivery",
        tableId: null,
        lines: [{ menuItemId: "item-coca", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER" });
    await expect(deliveryOrder({ phone: "12" })).rejects.toMatchObject({ code: "INVALID_PHONE" });

    const sud = await zoneId("Sud");
    await setDeliveryZoneArchived(db, manager, sud, true);
    await expect(deliveryOrder({ zoneId: sud })).rejects.toMatchObject({ code: "ZONE_REQUIRED" });
  });

  it("une zone gratuite ne crée pas de facture de frais", async () => {
    const free = await saveDeliveryZone(db, manager, { name: "Voisinage", feeMajor: 0 });
    const { invoices } = await deliveryOrder({ zoneId: free.id });
    expect(invoices.some((invoice) => invoice.servicePointId === null)).toBe(false);
  });

  it("EF-LIV-02, 03 : attribution, en route, livrée ; un autre livreur ne peut rien", async () => {
    const { order } = await deliveryOrder();
    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    if (!delivery) throw new Error("livraison attendue");

    await expect(setDeliveryStatus(db, courier, delivery.id, "en-route")).rejects.toMatchObject({
      code: "NOT_YOUR_DELIVERY",
    });
    await expect(assignDelivery(db, waiter, delivery.id, courier.userId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(assignDelivery(db, manager, delivery.id, waiter.userId)).rejects.toMatchObject({
      code: "NOT_A_COURIER",
    });
    await assignDelivery(db, manager, delivery.id, courier.userId);
    await expect(
      setDeliveryStatus(db, otherCourier, delivery.id, "en-route"),
    ).rejects.toMatchObject({ code: "NOT_YOUR_DELIVERY" });
    await setDeliveryStatus(db, courier, delivery.id, "en-route");
    const done = await setDeliveryStatus(db, courier, delivery.id, "delivered");
    expect(done.status).toBe("delivered");
    expect(done.events.map((event) => event.kind)).toEqual([
      "preparing",
      "assigned",
      "en-route",
      "delivered",
    ]);
    await expect(
      setDeliveryStatus(db, manager, delivery.id, "failed", "Trop tard"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("D-070 : le livreur encaisse ses livraisons, frais compris, et seulement les siennes", async () => {
    const { order, invoices } = await deliveryOrder();
    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    if (!delivery) throw new Error("livraison attendue");
    const payment = {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash" as const,
      provider: null,
      reference: null,
      currency: "CDF" as const,
      amountMajor: order.total.amountMinor / 100,
    };
    await expect(recordPayment(db, courier, payment)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await assignDelivery(db, manager, delivery.id, courier.userId);
    await expect(recordPayment(db, otherCourier, payment)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const recorded = await recordPayment(db, courier, payment);
    expect(recorded.collectedBy).toBe(courier.userId);
    const fee = invoices.find((invoice) => invoice.servicePointId === null);
    // Les frais (D-071) sont réglés comme une facture : l'affectation couvre tout leur montant.
    expect(recorded.allocations).toContainEqual({
      invoiceId: fee?.id,
      amount: { amountMinor: 300_000, currency: "CDF" },
    });
  });

  it("EF-LIV-03 : un échec exige un motif", async () => {
    const { order } = await deliveryOrder();
    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    if (!delivery) throw new Error("livraison attendue");
    await expect(setDeliveryStatus(db, manager, delivery.id, "failed", " ")).rejects.toMatchObject({
      code: "REASON_REQUIRED",
    });
    const failed = await setDeliveryStatus(db, manager, delivery.id, "failed", "Client absent");
    expect(failed.events.at(-1)).toMatchObject({ kind: "failed", note: "Client absent" });
  });

  it("RG-LIV-01 : plats perdus hors du stock, réutilisables remis ; commande annulée", async () => {
    const coca = async () =>
      (await stockCountDraft(db, manager, "sp-counter", "2026-11-07")).find(
        (line) => line.menuItemId === "item-coca",
      );
    const before = await coca();
    const failOrder = async () => {
      const { order } = await deliveryOrder();
      const delivery = await db.deliveries.where("orderId").equals(order.id).first();
      if (!delivery) throw new Error("livraison attendue");
      await setDeliveryStatus(db, manager, delivery.id, "failed", "Client absent");
      return { order, delivery };
    };

    const lost = await failOrder();
    await expect(settleFailedDelivery(db, waiter, lost.delivery.id, "lost")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const settled = await settleFailedDelivery(db, manager, lost.delivery.id, "lost");
    expect(settled.failureOutcome).toBe("lost");
    const invoices = await db.invoices.where("orderId").equals(lost.order.id).toArray();
    expect(invoices.every((invoice) => invoice.paymentStatus === "cancelled")).toBe(true);
    // Ventes annulées, mais les 2 Coca perdues sortent du stock attendu.
    expect(await coca()).toMatchObject({ sold: before?.sold, lost: 2 });
    await expect(
      settleFailedDelivery(db, manager, lost.delivery.id, "reusable"),
    ).rejects.toMatchObject({ code: "ALREADY_SETTLED" });

    const reused = await failOrder();
    await settleFailedDelivery(db, manager, reused.delivery.id, "reusable");
    expect(await coca()).toMatchObject({ sold: before?.sold, lost: 2 });
  });

  it("RG-LIV-01 : refusé si un paiement a été reçu", async () => {
    const { order, invoices } = await deliveryOrder();
    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    if (!delivery) throw new Error("livraison attendue");
    await recordPayment(db, manager, {
      invoiceIds: invoices.map((invoice) => invoice.id),
      method: "cash",
      provider: null,
      reference: null,
      currency: "CDF",
      amountMajor: 1000,
    });
    await setDeliveryStatus(db, manager, delivery.id, "failed", "Client absent");
    await expect(settleFailedDelivery(db, manager, delivery.id, "lost")).rejects.toMatchObject({
      code: "DELIVERY_PAID",
    });
  });
});
