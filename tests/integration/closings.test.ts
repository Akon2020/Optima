import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { businessDayKey } from "@/modules/restaurant/domain/business-day";
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
let day: string;
let paymentId: string;

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
  day = businessDayKey(new Date().toISOString());

  // Stock du matin des deux points de service (le vin sans prix n'est pas attendu).
  for (const [servicePointId, menuItemId, quantity] of [
    [fx.a.counter.id, fx.a.beer.id, 48],
    [fx.a.kitchen.id, fx.a.fries.id, 10],
  ] as const) {
    expect(
      await push(
        envelope("restaurant.morning-stock.entered", fx.managerA.id, {
          day,
          servicePointId,
          entries: [
            {
              id: crypto.randomUUID(),
              menuItemId,
              quantity,
              proposed: null,
              reason: null,
              replacesId: null,
              enteredAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    ).toBe("accepted");
  }

  // Une vente de 11 000 FC (2 Primus, des frites), encaissée par le serveur.
  const counter = crypto.randomUUID();
  const kitchen = crypto.randomUUID();
  expect(
    await push(
      envelope("restaurant.order.created", fx.waiterA.id, {
        orderId: crypto.randomUUID(),
        number: `CMD-2026-${device.code}-000001`,
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
            number: `FAC-2026-${device.code}-000001`,
            servicePointId: fx.a.counter.id,
          },
          {
            id: kitchen,
            number: `FAC-2026-${device.code}-000002`,
            servicePointId: fx.a.kitchen.id,
          },
        ],
      }),
    ),
  ).toBe("accepted");
  paymentId = crypto.randomUUID();
  expect(
    await push(
      envelope("restaurant.payment.recorded", fx.waiterA.id, {
        payment: {
          id: paymentId,
          method: "cash",
          provider: null,
          reference: null,
          tendered: { amountMinor: 1_100_000, currency: "CDF" },
          rateId: null,
          changeMinor: 0,
          allocations: [
            { invoiceId: counter, amountMinor: 700_000 },
            { invoiceId: kitchen, amountMinor: 400_000 },
          ],
          createdAt: new Date().toISOString(),
        },
      }),
    ),
  ).toBe("accepted");
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function validation() {
  return envelope("restaurant.day.validated", fx.managerA.id, {
    closing: { id: crypto.randomUUID(), day, validatedAt: new Date().toISOString(), comment: null },
  });
}

function stockCount(servicePointId: string, lines: { menuItemId: string; counted: number }[]) {
  return envelope("restaurant.stock.counted", fx.managerA.id, {
    count: {
      id: crypto.randomUUID(),
      day,
      servicePointId,
      countedAt: new Date().toISOString(),
      lines: lines.map((line) => ({ ...line, declaredOut: 0, outReason: null })),
      comment: null,
    },
  });
}

function cashClosing(counted: { key: string; amountMinor: number }[], comment: string | null) {
  return envelope("restaurant.cash-closing.declared", fx.waiterA.id, {
    closing: {
      id: crypto.randomUUID(),
      day,
      declaredAt: new Date().toISOString(),
      paymentIds: [paymentId],
      counted: counted.map((line) => ({ ...line, currency: "CDF" })),
      comment,
    },
  });
}

describe("clôture de service (EF-CLO-01 à 04)", () => {
  it("refuse de valider une journée dont le stock n'est pas compté", async () => {
    expect(await push(validation())).toBe("STOCK_NOT_COUNTED");
  });

  it("EF-CLO-03 : le gérant compte le stock ; le serveur relit matin et ventes", async () => {
    const byWaiter = {
      ...stockCount(fx.a.counter.id, [{ menuItemId: fx.a.beer.id, counted: 46 }]),
      userId: fx.waiterA.id,
    };
    expect(await push(byWaiter)).toBe("FORBIDDEN");
    expect(
      await push(stockCount(fx.a.counter.id, [{ menuItemId: fx.a.fries.id, counted: 9 }])),
    ).toBe("COUNT_INCOMPLETE");
    const counted = stockCount(fx.a.counter.id, [{ menuItemId: fx.a.beer.id, counted: 46 }]);
    expect(await push(counted)).toBe("accepted");
    const stored = await inA((tx) =>
      tx.stockCount.findUnique({
        where: { id: (counted.payload as { count: { id: string } }).count.id },
      }),
    );
    expect(stored?.lines).toEqual([
      expect.objectContaining({ menuItemId: fx.a.beer.id, morning: 48, sold: 2, counted: 46 }),
    ]);
    expect(
      await push(stockCount(fx.a.kitchen.id, [{ menuItemId: fx.a.fries.id, counted: 9 }])),
    ).toBe("accepted");
  });

  it("RG-CLO-01 : refuse de valider tant qu'une personne n'a pas déclaré sa caisse", async () => {
    const [result] = await pushOperations(db.prisma, device, [validation()]);
    expect(result).toMatchObject({ code: "CASH_NOT_DECLARED" });
    expect(result && "message" in result ? result.message : "").toContain("serveur.a");
  });

  it("EF-CLO-02 : recalcule l'attendu, exige un commentaire pour un écart, fige la déclaration", async () => {
    expect(await push(cashClosing([{ key: "cash::USD", amountMinor: 0 }], null))).toBe(
      "CLOSING_MISMATCH",
    );
    expect(await push(cashClosing([{ key: "cash::CDF", amountMinor: 1_000_000 }], null))).toBe(
      "COMMENT_REQUIRED",
    );
    const declared = cashClosing([{ key: "cash::CDF", amountMinor: 1_000_000 }], "Billet perdu");
    expect(await push(declared)).toBe("accepted");
    expect(await push(cashClosing([{ key: "cash::CDF", amountMinor: 1_100_000 }], null))).toBe(
      "PAYMENT_ALREADY_CLOSED",
    );

    const { changes } = await pullChanges(db.prisma, device, "0");
    const closing = changes.find((change) => change.entity === "cash_closing")?.data;
    expect(closing).toMatchObject({
      userId: fx.waiterA.id,
      paymentIds: [paymentId],
      lines: [
        {
          key: "cash::CDF",
          expected: { amountMinor: 1_100_000, currency: "CDF" },
          counted: { amountMinor: 1_000_000, currency: "CDF" },
        },
      ],
      byServicePoint: expect.arrayContaining([
        { servicePointId: fx.a.counter.id, amount: { amountMinor: 700_000, currency: "CDF" } },
      ]),
      comment: "Billet perdu",
    });
    const audit = await inA((tx) =>
      tx.auditLog.findFirst({ where: { action: "restaurant.cash-closing.declared" } }),
    );
    expect(audit?.reason).toBe("Billet perdu");
  });

  it("RG-CLO-03 : refuse de valider tant qu'un appareil signale des opérations en attente", async () => {
    await pullChanges(db.prisma, device, "0", undefined, 3);
    expect(await push(validation())).toBe("PENDING_OPERATIONS");
    await pullChanges(db.prisma, device, "0", undefined, 0);
  });

  it("EF-CLO-04 : valide la journée, puis RG-CLO-02 : plus rien ne s'y ajoute", async () => {
    const validated = validation();
    expect(await push(validated)).toBe("accepted");
    const closing = await inA((tx) => tx.dayClosing.findFirst({ where: { day } }));
    expect(closing?.cashClosingIds).toHaveLength(1);
    expect(closing?.stockCountIds).toHaveLength(2);
    expect(await push(validation())).toBe("DAY_VALIDATED");
    expect(
      await push(stockCount(fx.a.kitchen.id, [{ menuItemId: fx.a.fries.id, counted: 8 }])),
    ).toBe("DAY_VALIDATED");
  });

  it("les clôtures sont en ajout seul et isolées par établissement (ENF-08)", async () => {
    const closing = await inA((tx) => tx.cashClosing.findFirst());
    await expect(
      inA((tx) =>
        tx.cashClosing.update({ where: { id: closing?.id ?? "" }, data: { comment: "x" } }),
      ),
    ).rejects.toThrow();
    const seenFromB = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      async (tx) => (await tx.cashClosing.count()) + (await tx.dayClosing.count()),
    );
    expect(seenFromB).toBe(0);
  });
});
