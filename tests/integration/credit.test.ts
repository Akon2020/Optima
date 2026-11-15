import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import { getOwnerOverview } from "@/server/owner/overview";
import { buildBootstrap } from "@/server/sync/bootstrap";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let sequence = 0;
const customerId = crypto.randomUUID();

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

/** Commande de 11 000 FC : 2 Primus (7 000) et des frites (4 000). */
async function pushOrder() {
  sequence += 1;
  const orderId = crypto.randomUUID();
  const invoices = [crypto.randomUUID(), crypto.randomUUID()];
  expect(
    await push(
      envelope("restaurant.order.created", fx.waiterA.id, {
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
            id: invoices[0],
            number: `FAC-2026-${device.code}-${String(sequence * 10).padStart(6, "0")}`,
            servicePointId: fx.a.counter.id,
          },
          {
            id: invoices[1],
            number: `FAC-2026-${device.code}-${String(sequence * 10 + 1).padStart(6, "0")}`,
            servicePointId: fx.a.kitchen.id,
          },
        ],
      }),
    ),
  ).toBe("accepted");
  return { orderId, invoices: invoices as [string, string] };
}

function creditRequest(orderId: string, customer: string | null) {
  return envelope("restaurant.adjustment.requested", fx.waiterA.id, {
    request: {
      id: crypto.randomUUID(),
      kind: "credit",
      orderId,
      reason: "Cliente habituelle",
      discountMinor: null,
      customerId: customer,
      requestedAt: new Date().toISOString(),
    },
  });
}

function approval(requestId: string) {
  return envelope("restaurant.adjustment.decided", fx.managerA.id, {
    decision: {
      id: crypto.randomUUID(),
      requestId,
      approved: true,
      comment: null,
      decidedAt: new Date().toISOString(),
    },
  });
}

describe("fiches clients (EF-ENC-03, D-037, D-043)", () => {
  it("se créent avec un nom et un téléphone unique ; seul le gérant fixe le plafond", async () => {
    const create = (phone: string) =>
      envelope("restaurant.customer.created", fx.waiterA.id, {
        customer: {
          id: phone === "+243 99 123 45 67" ? customerId : crypto.randomUUID(),
          name: "Maman Rose",
          phone,
          createdAt: new Date().toISOString(),
        },
      });
    expect(await push(create("+243 99 123 45 67"))).toBe("accepted");
    expect(await push(create("+243991234567"))).toBe("PHONE_TAKEN");
    const limit = (userId: string) =>
      envelope("restaurant.customer.limit-set", userId, {
        customerId,
        creditLimitMinor: 1_500_000,
      });
    expect(await push(limit(fx.waiterA.id))).toBe("FORBIDDEN");
    expect(await push(limit(fx.managerA.id))).toBe("accepted");
    const stored = await inA((tx) => tx.customer.findUnique({ where: { id: customerId } }));
    expect(stored).toMatchObject({ phone: "+243991234567", creditLimitMinor: 1_500_000n });
  });
});

describe("vente à crédit (EF-ENC-03, EF-VTE-05, RG-ENC-02, D-059)", () => {
  it("convertit le reste en dette une fois le gérant d'accord, dans la limite du plafond", async () => {
    const { orderId, invoices } = await pushOrder();
    expect(await push(creditRequest(orderId, null))).toBe("CUSTOMER_REQUIRED");
    const request = creditRequest(orderId, customerId);
    expect(await push(request)).toBe("accepted");
    const requestId = (request.payload as { request: { id: string } }).request.id;
    expect(await push(approval(requestId))).toBe("accepted");

    const credited = await inA((tx) =>
      tx.advanceInvoice.findMany({
        where: { id: { in: invoices } },
        select: { creditRequestId: true, creditedMinor: true },
      }),
    );
    expect(credited.every((invoice) => invoice.creditRequestId === requestId)).toBe(true);
    expect(credited.reduce((sum, invoice) => sum + invoice.creditedMinor, 0n)).toBe(1_100_000n);
    const audit = await inA((tx) =>
      tx.auditLog.findFirst({ where: { action: "restaurant.credit.granted", entityId: orderId } }),
    );
    expect(audit).not.toBeNull();

    // Plafond de 15 000 FC : 11 000 déjà dus, un second crédit de 11 000 est refusé.
    const second = await pushOrder();
    expect(await push(creditRequest(second.orderId, customerId))).toBe("CREDIT_LIMIT");

    // EF-TRE-03 : un remboursement est un encaissement ordinaire, qui réduit la dette.
    expect(
      await push(
        envelope("restaurant.payment.recorded", fx.managerA.id, {
          payment: {
            id: crypto.randomUUID(),
            method: "cash",
            provider: null,
            reference: null,
            tendered: { amountMinor: 700_000, currency: "CDF" },
            rateId: null,
            changeMinor: 0,
            allocations: [{ invoiceId: invoices[0], amountMinor: 700_000 }],
            createdAt: new Date().toISOString(),
          },
        }),
      ),
    ).toBe("accepted");
    expect(await push(creditRequest(second.orderId, customerId))).toBe("accepted");
  });

  it("l'état initial d'un appareil porte les clients et les dettes ouvertes", async () => {
    const bootstrap = await buildBootstrap(db.prisma, device);
    expect(bootstrap.customers.map((customer) => customer.name)).toEqual(["Maman Rose"]);
    expect(bootstrap.invoices.some((invoice) => invoice.creditRequestId)).toBe(true);
    expect(bootstrap.adjustmentRequests.some((request) => request.kind === "credit")).toBe(true);
  });

  it("EF-PRO-01 : le propriétaire voit l'encours et les débiteurs (D-063)", async () => {
    const overview = await getOwnerOverview(
      db.prisma,
      { userId: fx.owner.id, isOwner: true, isElevated: true },
      { period: "jour" },
    );
    const a = overview.establishments.find((entry) => entry.id === fx.a.id);
    const b = overview.establishments.find((entry) => entry.id === fx.b.id);
    // 11 000 FC mis à crédit, 7 000 remboursés ; le second crédit attend le gérant.
    expect(a?.debts.outstanding).toEqual({ amountMinor: 400_000, currency: "CDF" });
    expect(a?.debts.openDebts).toBe(1);
    expect(a?.debts.debtors.map((debtor) => debtor.name)).toEqual(["Maman Rose"]);
    expect(b?.debts.outstanding.amountMinor).toBe(0);
    expect(overview.debtors[0]).toMatchObject({ name: "Maman Rose", establishmentName: fx.a.name });
  });

  it("les fiches clients sont isolées par établissement (ENF-08)", async () => {
    const seenFromB = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      (tx) => tx.customer.count(),
    );
    expect(seenFromB).toBe(0);
  });
});
