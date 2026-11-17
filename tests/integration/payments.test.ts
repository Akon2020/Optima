import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatMoney, moneyFromMinor } from "@/shared/lib/money";
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

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone caisse" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

let sequence = 0;

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

/** Commande de 11 000 FC : 2 Primus au comptoir (7 000) et des frites en cuisine (4 000). */
async function pushOrder(userId: string = fx.waiterA.id) {
  sequence += 1;
  const counter = crypto.randomUUID();
  const kitchen = crypto.randomUUID();
  const operation = envelope("restaurant.order.created", userId, {
    orderId: crypto.randomUUID(),
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
  });
  const [result] = await pushOperations(db.prisma, device, [operation]);
  expect(result?.status).toBe("accepted");
  return { counter, kitchen };
}

function paymentOperation(
  userId: string,
  payment: {
    tendered: { amountMinor: number; currency: "CDF" | "USD" };
    changeMinor?: number;
    rateId?: string | null;
    method?: "cash" | "mobile-money";
    provider?: "mpesa" | null;
    allocations: { invoiceId: string; amountMinor: number }[];
  },
) {
  return envelope("restaurant.payment.recorded", userId, {
    payment: {
      id: crypto.randomUUID(),
      method: payment.method ?? "cash",
      provider: payment.provider ?? null,
      reference: null,
      tendered: payment.tendered,
      rateId: payment.rateId ?? null,
      changeMinor: payment.changeMinor ?? 0,
      allocations: payment.allocations,
      createdAt: new Date().toISOString(),
    },
  });
}

function inA<T>(run: Parameters<typeof withContext<T>>[2]) {
  return withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, run);
}

let rateId: string;

describe("taux du dollar (EF-PRX-05, RG-PRX-02)", () => {
  it("est saisi par le gérant, refusé au serveur, et audité", async () => {
    const refused = envelope("restaurant.exchange-rate.added", fx.waiterA.id, {
      rate: { id: crypto.randomUUID(), rate: "2900", effectiveAt: new Date().toISOString() },
    });
    rateId = crypto.randomUUID();
    const accepted = envelope("restaurant.exchange-rate.added", fx.managerA.id, {
      rate: { id: rateId, rate: "2850", effectiveAt: new Date().toISOString() },
    });
    const results = await pushOperations(db.prisma, device, [refused, accepted]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "accepted"]);
    const stored = await inA(async (tx) => ({
      rate: await tx.exchangeRate.findUnique({ where: { id: rateId } }),
      audit: await tx.auditLog.findFirst({ where: { action: "restaurant.exchange-rate.added" } }),
    }));
    expect(stored.rate?.rate.toFixed()).toBe("2850");
    expect(stored.audit?.entityId).toBe(rateId);
  });

  it("ne se modifie jamais (table en ajout seul)", async () => {
    await expect(
      inA((tx) => tx.exchangeRate.update({ where: { id: rateId }, data: { rate: "1" } })),
    ).rejects.toThrow();
  });
});

describe("encaissement (EF-ENC-02, D-032)", () => {
  it("enregistre un paiement en francs et solde les factures", async () => {
    const { counter, kitchen } = await pushOrder();
    const operation = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 1_500_000, currency: "CDF" },
      changeMinor: 400_000,
      allocations: [
        { invoiceId: counter, amountMinor: 700_000 },
        { invoiceId: kitchen, amountMinor: 400_000 },
      ],
    });
    const [result] = await pushOperations(db.prisma, device, [operation]);
    expect(result).toEqual({ id: operation.id, status: "accepted" });
    const invoices = await inA((tx) =>
      tx.advanceInvoice.findMany({ where: { id: { in: [counter, kitchen] } } }),
    );
    expect(invoices.map((invoice) => invoice.paymentStatus)).toEqual(["paid", "paid"]);

    const { changes } = await pullChanges(db.prisma, device, "0");
    const payment = changes.find((change) => change.entity === "payment");
    expect(payment?.data).toMatchObject({
      collectedBy: fx.waiterA.id,
      change: { amountMinor: 400_000, currency: "CDF" },
      allocations: [
        { invoiceId: counter, amount: { amountMinor: 700_000, currency: "CDF" } },
        { invoiceId: kitchen, amount: { amountMinor: 400_000, currency: "CDF" } },
      ],
    });
  });

  it("RG-PRX-02 : recalcule la contre-valeur des dollars avec le taux du serveur", async () => {
    const { counter, kitchen } = await pushOrder();
    const operation = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 2_000, currency: "USD" },
      rateId,
      changeMinor: 4_600_000,
      allocations: [
        { invoiceId: counter, amountMinor: 700_000 },
        { invoiceId: kitchen, amountMinor: 400_000 },
      ],
    });
    expect((await pushOperations(db.prisma, device, [operation]))[0]?.status).toBe("accepted");
    const stored = await inA((tx) =>
      tx.payment.findUnique({
        where: { id: (operation.payload as { payment: { id: string } }).payment.id },
      }),
    );
    expect(stored?.baseAmountMinor).toBe(5_700_000n);
    expect(stored?.rate?.toFixed()).toBe("2850");
  });

  it("refuse des montants qui ne concordent pas, ou un taux inconnu", async () => {
    const { counter } = await pushOrder();
    // 20 $ = 57 000 FC : 40 000 rendus + 7 000 réglés laissent 10 000 FC inexpliqués.
    const wrongChange = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 2_000, currency: "USD" },
      rateId,
      changeMinor: 4_000_000,
      allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
    });
    const unknownRate = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 2_000, currency: "USD" },
      rateId: crypto.randomUUID(),
      changeMinor: 5_000_000,
      allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
    });
    const mobileWithChange = paymentOperation(fx.waiterA.id, {
      method: "mobile-money",
      provider: "mpesa",
      tendered: { amountMinor: 800_000, currency: "CDF" },
      changeMinor: 100_000,
      allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
    });
    const results = await pushOperations(db.prisma, device, [
      wrongChange,
      unknownRate,
      mobileWithChange,
    ]);
    expect(results.map((result) => ("code" in result ? result.code : result.status))).toEqual([
      "PAYMENT_MISMATCH",
      "RATE_NOT_FOUND",
      "PAYMENT_MISMATCH",
    ]);
  });

  it("un serveur n'encaisse que ses ventes ; le gérant encaisse à sa place", async () => {
    const { counter, kitchen } = await pushOrder(fx.managerA.id);
    const allocations = [
      { invoiceId: counter, amountMinor: 700_000 },
      { invoiceId: kitchen, amountMinor: 400_000 },
    ];
    const byWaiter = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 1_100_000, currency: "CDF" },
      allocations,
    });
    const byManager = paymentOperation(fx.managerA.id, {
      tendered: { amountMinor: 1_100_000, currency: "CDF" },
      allocations,
    });
    const results = await pushOperations(db.prisma, device, [byWaiter, byManager]);
    expect(results.map((result) => ("code" in result ? result.code : result.status))).toEqual([
      "FORBIDDEN",
      "accepted",
    ]);
  });

  it("RG-OFF-03 : deux encaissements hors connexion s'additionnent et le trop-perçu est audité", async () => {
    const { counter } = await pushOrder();
    const first = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 700_000, currency: "CDF" },
      allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
    });
    const second = paymentOperation(fx.waiterA.id, {
      tendered: { amountMinor: 700_000, currency: "CDF" },
      allocations: [{ invoiceId: counter, amountMinor: 700_000 }],
    });
    const results = await pushOperations(db.prisma, device, [first, second]);
    expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
    const audit = await inA((tx) =>
      tx.auditLog.findFirst({
        where: { action: "restaurant.payment.overpaid", entityId: counter },
      }),
    );
    expect(audit?.after).toMatchObject({
      total: formatMoney(moneyFromMinor(700_000, "CDF")),
      paid: formatMoney(moneyFromMinor(1_400_000, "CDF")),
    });
  });

  it("les paiements sont en ajout seul et isolés par établissement (ENF-08)", async () => {
    const payment = await inA((tx) => tx.payment.findFirst());
    expect(payment).not.toBeNull();
    await expect(
      inA((tx) =>
        tx.payment.update({ where: { id: payment?.id ?? "" }, data: { changeMinor: 0n } }),
      ),
    ).rejects.toThrow();
    const seenFromB = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      (tx) => tx.payment.count(),
    );
    expect(seenFromB).toBe(0);
  });
});
