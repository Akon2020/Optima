import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let sequence = 0;

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone salle" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function envelope(type: string, userId: string, payload: unknown) {
  return {
    id: crypto.randomUUID(),
    type,
    establishmentId: fx.a.id,
    userId,
    deviceId: device.id,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    payload,
  };
}

async function push(operation: ReturnType<typeof envelope>) {
  const [result] = await pushOperations(db.prisma, device, [operation]);
  return result && "code" in result ? result.code : result?.status;
}

function inA<T>(run: Parameters<typeof withContext<T>>[2]) {
  return withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, run);
}

/** Commande de 11 000 FC : 2 Primus (7 000) au comptoir, des frites (4 000) en cuisine. */
async function pushOrder(userId: string = fx.waiterA.id) {
  sequence += 1;
  const orderId = crypto.randomUUID();
  const counter = crypto.randomUUID();
  const kitchen = crypto.randomUUID();
  const result = await push(
    envelope("restaurant.order.created", userId, {
      orderId,
      number: `CMD-2026-${device.code}-${String(sequence).padStart(6, "0")}`,
      createdAt: new Date().toISOString(),
      mode: "takeaway",
      tableId: null,
      lines: [
        { menuItemId: fx.a.beer.id, quantity: 2 },
        { menuItemId: fx.a.fries.id, quantity: 1 },
      ],
      invoices: [
        {
          id: counter,
          number: `FAC-2026-${device.code}-${String(sequence * 10).padStart(6, "0")}`,
          servicePointId: fx.a.counter.id,
        },
        {
          id: kitchen,
          number: `FAC-2026-${device.code}-${String(sequence * 10 + 1).padStart(6, "0")}`,
          servicePointId: fx.a.kitchen.id,
        },
      ],
    }),
  );
  expect(result).toBe("accepted");
  return { orderId, counter, kitchen };
}

function requested(
  userId: string,
  orderId: string,
  kind: "cancel" | "discount",
  discountMinor: number | null = null,
) {
  return envelope("restaurant.adjustment.requested", userId, {
    request: {
      id: crypto.randomUUID(),
      kind,
      orderId,
      reason: "Erreur de saisie",
      discountMinor,
      requestedAt: new Date().toISOString(),
    },
  });
}

function decided(userId: string, requestId: string, approved: boolean, comment: string | null) {
  return envelope("restaurant.adjustment.decided", userId, {
    decision: {
      id: crypto.randomUUID(),
      requestId,
      approved,
      comment,
      decidedAt: new Date().toISOString(),
    },
  });
}

const requestId = (operation: ReturnType<typeof requested>) =>
  (operation.payload as { request: { id: string } }).request.id;

describe("annulation validée par le gérant (RG-CMD-02, RG-VTE-02)", () => {
  it("le serveur demande ; seul le gérant valide ; la facture annulée garde son numéro", async () => {
    const { orderId, counter, kitchen } = await pushOrder();
    const request = requested(fx.waiterA.id, orderId, "cancel");
    expect(await push(request)).toBe("accepted");
    expect(await push(requested(fx.waiterA.id, orderId, "cancel"))).toBe("REQUEST_PENDING");
    expect(await push(decided(fx.waiterA.id, requestId(request), true, null))).toBe("FORBIDDEN");
    expect(await push(decided(fx.managerA.id, requestId(request), true, null))).toBe("accepted");
    expect(await push(decided(fx.managerA.id, requestId(request), true, null))).toBe(
      "ALREADY_DECIDED",
    );

    const invoices = await inA((tx) =>
      tx.advanceInvoice.findMany({ where: { id: { in: [counter, kitchen] } } }),
    );
    expect(invoices.every((invoice) => invoice.cancelledAt !== null)).toBe(true);
    expect(invoices[0]?.cancelReason).toBe("Erreur de saisie");
    const audit = await inA((tx) =>
      tx.auditLog.findFirst({
        where: { action: "restaurant.invoice.cancelled", entityId: orderId },
      }),
    );
    expect(audit?.reason).toBe("Erreur de saisie");

    const { changes } = await pullChanges(db.prisma, device, "0");
    const invoice = changes
      .filter((change) => change.entity === "advance_invoice" && change.entityId === counter)
      .at(-1)?.data;
    expect(invoice).toMatchObject({ paymentStatus: "cancelled", cancelReason: "Erreur de saisie" });
  });

  it("RG-CMD-03 : un serveur ne demande rien sur la commande d'un autre", async () => {
    const { orderId } = await pushOrder(fx.managerA.id);
    expect(await push(requested(fx.waiterA.id, orderId, "cancel"))).toBe("FORBIDDEN");
  });

  it("refuse d'annuler une facture déjà encaissée", async () => {
    const { orderId, counter } = await pushOrder();
    expect(
      await push(
        envelope("restaurant.payment.recorded", fx.waiterA.id, {
          payment: {
            id: crypto.randomUUID(),
            method: "cash",
            provider: null,
            reference: null,
            tendered: { amountMinor: 700_000, currency: "CDF" },
            rateId: null,
            changeMinor: 0,
            allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
            createdAt: new Date().toISOString(),
          },
        }),
      ),
    ).toBe("accepted");
    expect(await push(requested(fx.waiterA.id, orderId, "cancel"))).toBe("ALREADY_PAID");
  });

  it("un refus doit être expliqué", async () => {
    const { orderId } = await pushOrder();
    const request = requested(fx.waiterA.id, orderId, "cancel");
    expect(await push(request)).toBe("accepted");
    expect(await push(decided(fx.managerA.id, requestId(request), false, null))).toBe(
      "COMMENT_REQUIRED",
    );
    expect(
      await push(decided(fx.managerA.id, requestId(request), false, "Plats déjà servis")),
    ).toBe("accepted");
  });
});

describe("remise validée par le gérant (RG-ENC-01)", () => {
  it("répartit la remise et réduit ce que le client doit", async () => {
    const { orderId, counter, kitchen } = await pushOrder();
    expect(await push(requested(fx.waiterA.id, orderId, "discount", 2_000_000))).toBe(
      "MORE_THAN_DUE",
    );
    const request = requested(fx.waiterA.id, orderId, "discount", 110_000);
    expect(await push(request)).toBe("accepted");
    expect(await push(decided(fx.managerA.id, requestId(request), true, null))).toBe("accepted");
    const discounts = await inA((tx) =>
      tx.advanceInvoice.findMany({
        where: { id: { in: [counter, kitchen] } },
        orderBy: { number: "asc" },
        select: { discountMinor: true },
      }),
    );
    expect(discounts.map((invoice) => invoice.discountMinor)).toEqual([70_000n, 40_000n]);

    // 9 900 FC soldent la commande de 11 000 FC remisée de 1 100 FC.
    expect(
      await push(
        envelope("restaurant.payment.recorded", fx.waiterA.id, {
          payment: {
            id: crypto.randomUUID(),
            method: "cash",
            provider: null,
            reference: null,
            tendered: { amountMinor: 990_000, currency: "CDF" },
            rateId: null,
            changeMinor: 0,
            allocations: [
              { invoiceId: counter, amountMinor: 630_000 },
              { invoiceId: kitchen, amountMinor: 360_000 },
            ],
            createdAt: new Date().toISOString(),
          },
        }),
      ),
    ).toBe("accepted");
    const statuses = await inA((tx) =>
      tx.advanceInvoice.findMany({
        where: { id: { in: [counter, kitchen] } },
        select: { paymentStatus: true },
      }),
    );
    expect(statuses.map((invoice) => invoice.paymentStatus)).toEqual(["paid", "paid"]);
  });

  it("demandes et décisions sont en ajout seul et isolées par établissement (ENF-08)", async () => {
    const request = await inA((tx) => tx.adjustmentRequest.findFirst());
    await expect(
      inA((tx) =>
        tx.adjustmentRequest.update({ where: { id: request?.id ?? "" }, data: { reason: "x" } }),
      ),
    ).rejects.toThrow();
    const seenFromB = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      async (tx) => (await tx.adjustmentRequest.count()) + (await tx.adjustmentDecision.count()),
    );
    expect(seenFromB).toBe(0);
  });
});
