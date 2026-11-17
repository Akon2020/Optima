import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/server/authz/authorize";
import { withContext } from "@/server/db/context";
import {
  getClosingsView,
  recordClosingAdjustment,
  validatePeriod,
} from "@/server/restaurant/periods";
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

const manager = (): Actor => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });
const waiter = (): Actor => ({ userId: fx.waiterA.id, isOwner: false, isElevated: true });
const owner = (): Actor => ({ userId: fx.owner.id, isOwner: true, isElevated: true });

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

  // Une vente de 11 000 FC le 02/10, à midi à Bukavu.
  const [result] = await pushOperations(db.prisma, device, [
    {
      id: crypto.randomUUID(),
      type: "restaurant.order.created",
      establishmentId: fx.a.id,
      userId: fx.waiterA.id,
      deviceId: device.id,
      createdAt: "2026-10-02T10:00:00.000Z",
      schemaVersion: 1,
      payload: {
        orderId: crypto.randomUUID(),
        number: `CMD-2026-${device.code}-000001`,
        createdAt: "2026-10-02T10:00:00.000Z",
        mode: "takeaway",
        tableId: null,
        lines: [
          { menuItemId: fx.a.beer.id, quantity: 2 },
          { menuItemId: fx.a.fries.id, quantity: 1 },
        ],
        invoices: [
          {
            id: crypto.randomUUID(),
            number: `FAC-2026-${device.code}-000001`,
            servicePointId: fx.a.counter.id,
          },
          {
            id: crypto.randomUUID(),
            number: `FAC-2026-${device.code}-000002`,
            servicePointId: fx.a.kitchen.id,
          },
        ],
      },
    },
  ]);
  expect(result?.status).toBe("accepted");

  // Journées du 01 au 03/10 validées ; le serveur a déclaré 10 000 sur 11 000 le 02.
  await withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, async (tx) => {
    const cashId = crypto.randomUUID();
    await tx.cashClosing.create({
      data: {
        id: cashId,
        establishmentId: fx.a.id,
        day: "2026-10-02",
        userId: fx.waiterA.id,
        deviceId: device.id,
        declaredAt: new Date("2026-10-02T20:00:00.000Z"),
        lines: [
          {
            key: "cash::CDF",
            method: "cash",
            provider: null,
            expected: { amountMinor: 1_100_000, currency: "CDF" },
            counted: { amountMinor: 1_000_000, currency: "CDF" },
          },
        ],
        byServicePoint: [],
        unpaidInvoiceIds: [],
        comment: "Il manque 1 000",
      },
    });
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
      await tx.dayClosing.create({
        data: {
          id: crypto.randomUUID(),
          establishmentId: fx.a.id,
          day,
          validatedAt: new Date(`${day}T21:00:00.000Z`),
          validatedBy: fx.managerA.id,
          cashClosingIds: day === "2026-10-02" ? [cashId] : [],
          stockCountIds: [],
        },
      });
    }
  });
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

const cash = (overrides: Partial<{ day: string; userId: string; amountMajor: number }> = {}) => ({
  establishmentId: fx.a.id,
  adjustment: {
    kind: "cash" as const,
    day: "2026-10-02",
    userId: fx.waiterA.id,
    amountMajor: 500,
    reason: "Billet retrouvé sous le comptoir",
    ...overrides,
  },
});

describe("écritures d'ajustement (RG-CLO-02, D-064)", () => {
  it("le gérant corrige une journée validée ; le serveur ne le peut pas", async () => {
    await expect(recordClosingAdjustment(db.prisma, waiter(), cash())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      recordClosingAdjustment(db.prisma, manager(), cash({ day: "2026-10-05" })),
    ).rejects.toMatchObject({ code: "DAY_NOT_VALIDATED" });
    await expect(
      recordClosingAdjustment(db.prisma, manager(), cash({ userId: fx.waiterB.id })),
    ).rejects.toMatchObject({ code: "PERSON_NOT_FOUND" });
    // IDOR : un élément d'un autre établissement est refusé.
    await expect(
      recordClosingAdjustment(db.prisma, manager(), {
        establishmentId: fx.a.id,
        adjustment: {
          kind: "stock",
          day: "2026-10-02",
          servicePointId: fx.a.counter.id,
          menuItemId: fx.b.beer.id,
          quantity: 1,
          reason: "Casier retrouvé",
        },
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });

    const { id } = await recordClosingAdjustment(db.prisma, manager(), cash());
    const audit = await withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
      tx.auditLog.findFirst({ where: { action: "restaurant.closing.adjusted", entityId: id } }),
    );
    expect(audit?.reason).toBe("Billet retrouvé sous le comptoir");
  });
});

describe("clôture de période (EF-CLO-05, D-064)", () => {
  it("l'aperçu résume la période ; une journée active non validée bloque", async () => {
    const view = await getClosingsView(db.prisma, manager(), {
      establishmentId: fx.a.id,
      preview: { from: "2026-10-01", to: "2026-10-03" },
    });
    expect(view.canManage).toBe(true);
    expect(view.preview?.issue).toBeNull();
    expect(view.preview?.summary?.revenue).toEqual({ amountMinor: 1_100_000, currency: "CDF" });
    // Serveur : 10 000 comptés + 500 retrouvés − 11 000 attendus = −500.
    expect(view.preview?.summary?.people[0]).toMatchObject({
      userName: fx.waiterA.displayName,
      variance: { amountMinor: -50_000, currency: "CDF" },
    });
    expect(view.adjustments).toHaveLength(1);

    const reader = await getClosingsView(db.prisma, waiter(), { establishmentId: fx.a.id });
    expect(reader.canManage).toBe(false);
  });

  it("le gérant valide ; la période est figée, ne se recoupe pas et bloque les corrections", async () => {
    await expect(
      validatePeriod(db.prisma, waiter(), {
        establishmentId: fx.a.id,
        from: "2026-10-01",
        to: "2026-10-03",
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { id, summary } = await validatePeriod(db.prisma, manager(), {
      establishmentId: fx.a.id,
      from: "2026-10-01",
      to: "2026-10-03",
      comment: "Fiche d'octobre, première semaine",
    });
    expect(summary.validatedDays).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);

    await expect(
      validatePeriod(db.prisma, manager(), {
        establishmentId: fx.a.id,
        from: "2026-10-03",
        to: "2026-10-03",
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_OVERLAP" });
    await expect(recordClosingAdjustment(db.prisma, manager(), cash())).rejects.toMatchObject({
      code: "PERIOD_CLOSED",
    });

    // RG-CLO-02 : la clôture de période est en ajout seul.
    await expect(
      withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
        tx.periodClosing.update({ where: { id }, data: { comment: "modifié" } }),
      ),
    ).rejects.toThrow();

    // Le propriétaire la voit ; l'autre établissement, non (ENF-08).
    const ownerView = await getClosingsView(db.prisma, owner(), { establishmentId: fx.a.id });
    expect(ownerView.periods.map((period) => period.id)).toEqual([id]);
    const seenFromB = await withContext(
      db.prisma,
      { establishmentId: fx.b.id, isOwner: false },
      (tx) => tx.periodClosing.count(),
    );
    expect(seenFromB).toBe(0);
  });
});
