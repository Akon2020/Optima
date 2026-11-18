import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import { buildBootstrap } from "@/server/sync/bootstrap";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

/**
 * Livraison (EF-LIV-01 à 04, D-070, D-071) : module exigé, zones du gérant,
 * frais relus par le serveur et facturés à part, attribution à un livreur,
 * statuts horodatés en ajout seul, encaissement par le livreur de ses
 * livraisons seulement, isolation entre établissements.
 */
let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let courierId = "";
let otherCourierId = "";
let sequence = 0;
const zoneId = crypto.randomUUID();

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  const courier = async (email: string, name: string) => {
    const user = await db.prisma.user.create({
      data: {
        email,
        displayName: name,
        passwordHash: fx.owner.passwordHash,
        mustChangePassword: false,
      },
    });
    await db.prisma.membership.create({
      data: { userId: user.id, establishmentId: fx.a.id, role: "courier" },
    });
    return user.id;
  };
  courierId = await courier("livreur.a@optima.test", "Livreur A");
  otherCourierId = await courier("livreur2.a@optima.test", "Livreur A2");
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone partagé" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function inA<T>(run: Parameters<typeof withContext<T>>[2]) {
  return withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, run);
}

async function push(userId: string, type: string, payload: unknown) {
  const [result] = await pushOperations(db.prisma, device, [
    {
      id: crypto.randomUUID(),
      type,
      establishmentId: fx.a.id,
      userId,
      deviceId: device.id,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      payload,
    },
  ]);
  return result && "code" in result ? result.code : result?.status;
}

function number(prefix: "CMD" | "FAC") {
  sequence += 1;
  return `${prefix}-2026-${device.code}-${String(sequence).padStart(6, "0")}`;
}

function deliveryOrder(input: { withFeeInvoice?: boolean; zone?: string } = {}) {
  const orderId = crypto.randomUUID();
  const kitchenInvoice = crypto.randomUUID();
  const feeInvoice = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  return {
    orderId,
    kitchenInvoice,
    feeInvoice,
    deliveryId,
    payload: {
      orderId,
      number: number("CMD"),
      createdAt: new Date().toISOString(),
      mode: "delivery",
      tableId: null,
      lines: [{ menuItemId: fx.a.fries.id, quantity: 2 }],
      invoices: [{ id: kitchenInvoice, number: number("FAC"), servicePointId: fx.a.kitchen.id }],
      delivery: {
        id: deliveryId,
        feeInvoice:
          input.withFeeInvoice === false ? null : { id: feeInvoice, number: number("FAC") },
        customerName: "Neema",
        phone: "+243 990 000 001",
        address: "Avenue des Écoles 12",
        zoneId: input.zone ?? zoneId,
        desiredTime: "19:30",
      },
    },
  };
}

describe("livraison (D-070, D-071)", () => {
  it("exige le module Livraison", async () => {
    const order = deliveryOrder();
    // D-026 : l'opération n'est pas refusée, elle attend la réactivation du module.
    expect(await push(fx.waiterA.id, "restaurant.order.created", order.payload)).toBe("retry");
    const zone = { zone: { id: zoneId, name: "Nord", feeMajor: 3000, sortOrder: 1 } };
    expect(await push(fx.managerA.id, "delivery.zone.saved", zone)).toBe("retry");
    // Le propriétaire active le module (hors appareil).
    await db.asAdmin();
    await db.prisma.establishmentModule.create({
      data: { establishmentId: fx.a.id, module: "delivery", enabled: true },
    });
    await db.asApp();
  });

  it("EF-LIV-01 : le gérant crée la zone ; le serveur ne le peut pas", async () => {
    const zone = { zone: { id: zoneId, name: "Nord", feeMajor: 3000, sortOrder: 1 } };
    expect(await push(fx.waiterA.id, "delivery.zone.saved", zone)).toBe("FORBIDDEN");
    expect(await push(fx.managerA.id, "delivery.zone.saved", zone)).toBe("accepted");
    const row = await inA((tx) => tx.deliveryZone.findUniqueOrThrow({ where: { id: zoneId } }));
    expect(row.feeMinor).toBe(300_000n);
  });

  it("la commande crée la livraison et la facture des frais, sans point de service", async () => {
    const missingFee = deliveryOrder({ withFeeInvoice: false });
    expect(await push(fx.waiterA.id, "restaurant.order.created", missingFee.payload)).toBe(
      "FEE_INVOICE_REQUIRED",
    );
    const order = deliveryOrder();
    expect(await push(fx.waiterA.id, "restaurant.order.created", order.payload)).toBe("accepted");
    const { fee, delivery, events, total } = await inA(async (tx) => ({
      fee: await tx.advanceInvoice.findUniqueOrThrow({ where: { id: order.feeInvoice } }),
      delivery: await tx.delivery.findUniqueOrThrow({ where: { id: order.deliveryId } }),
      events: await tx.deliveryEvent.findMany({ where: { deliveryId: order.deliveryId } }),
      total: (await tx.order.findUniqueOrThrow({ where: { id: order.orderId } })).totalMinor,
    }));
    expect(fee).toMatchObject({ servicePointId: null, totalMinor: 300_000n, prepStatus: "served" });
    expect(delivery).toMatchObject({
      phone: "+243990000001",
      zoneName: "Nord",
      feeMinor: 300_000n,
      feeInvoiceId: order.feeInvoice,
      status: "preparing",
    });
    expect(events.map((event) => event.kind)).toEqual(["preparing"]);
    expect(total).toBe(2n * fx.a.fries.priceMinor! + 300_000n);

    // Les frais ne se préparent pas.
    expect(
      await push(fx.managerA.id, "restaurant.invoice.prep-status-changed", {
        invoiceId: order.feeInvoice,
        status: "ready",
      }),
    ).toBe("NOT_PREPARED");
  });

  it("EF-LIV-02 à 04 : attribution, statuts, encaissement par le livreur", async () => {
    const order = deliveryOrder();
    expect(await push(fx.waiterA.id, "restaurant.order.created", order.payload)).toBe("accepted");
    const at = () => new Date().toISOString();
    const assign = (userId: string, courier: string) =>
      push(userId, "delivery.assigned", {
        deliveryId: order.deliveryId,
        eventId: crypto.randomUUID(),
        courierId: courier,
        at: at(),
      });
    const status = (userId: string, next: string, note: string | null = null) =>
      push(userId, "delivery.status-changed", {
        deliveryId: order.deliveryId,
        eventId: crypto.randomUUID(),
        status: next,
        note,
        at: at(),
      });
    const pay = (userId: string) =>
      push(userId, "restaurant.payment.recorded", {
        payment: {
          id: crypto.randomUUID(),
          method: "cash",
          provider: null,
          reference: null,
          tendered: {
            amountMinor: Number(2n * fx.a.fries.priceMinor! + 300_000n),
            currency: "CDF",
          },
          rateId: null,
          changeMinor: 0,
          allocations: [
            { invoiceId: order.kitchenInvoice, amountMinor: Number(2n * fx.a.fries.priceMinor!) },
            { invoiceId: order.feeInvoice, amountMinor: 300_000 },
          ],
          createdAt: at(),
        },
      });

    expect(await assign(fx.waiterA.id, courierId)).toBe("FORBIDDEN");
    expect(await assign(fx.managerA.id, fx.waiterA.id)).toBe("NOT_A_COURIER");
    expect(await status(courierId, "en-route")).toBe("NOT_YOUR_DELIVERY");
    expect(await pay(courierId)).toBe("FORBIDDEN");
    expect(await assign(fx.managerA.id, courierId)).toBe("accepted");

    expect(await status(otherCourierId, "en-route")).toBe("NOT_YOUR_DELIVERY");
    expect(await status(courierId, "delivered")).toBe("INVALID_TRANSITION");
    expect(await status(courierId, "en-route")).toBe("accepted");
    expect(await pay(otherCourierId)).toBe("FORBIDDEN");
    expect(await pay(courierId)).toBe("accepted");
    expect(await status(courierId, "delivered")).toBe("accepted");

    const { delivery, events, audit } = await inA(async (tx) => ({
      delivery: await tx.delivery.findUniqueOrThrow({ where: { id: order.deliveryId } }),
      events: await tx.deliveryEvent.findMany({
        where: { deliveryId: order.deliveryId },
        orderBy: { at: "asc" },
      }),
      audit: await tx.auditLog.findMany({
        where: { entityId: order.deliveryId },
        select: { action: true },
      }),
    }));
    expect(delivery).toMatchObject({ status: "delivered", courierId });
    expect(events.map((event) => event.kind)).toEqual([
      "preparing",
      "assigned",
      "en-route",
      "delivered",
    ]);
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["delivery.assigned", "delivery.status-changed"]),
    );

    // EF-LIV-03 : l'historique ne se modifie plus.
    await expect(
      inA((tx) =>
        tx.deliveryEvent.updateMany({
          where: { deliveryId: order.deliveryId },
          data: { note: "modifié" },
        }),
      ),
    ).rejects.toThrow();

    // L'état initial d'un appareil porte zones et livraisons.
    const bootstrap = await buildBootstrap(db.prisma, device);
    expect(bootstrap.deliveryZones.map((zone) => zone.id)).toContain(zoneId);
    expect(bootstrap.deliveries.find((entry) => entry.id === order.deliveryId)).toMatchObject({
      status: "delivered",
      courierName: "Livreur A",
    });
  });

  it("RLS : un autre établissement ne voit ni zones ni livraisons", async () => {
    const rows = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      async (tx) => [...(await tx.deliveryZone.findMany()), ...(await tx.delivery.findMany())],
    );
    expect(rows).toEqual([]);
  });
});
