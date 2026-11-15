import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/server/authz/authorize";
import { withContext } from "@/server/db/context";
import { exportRestaurantReport, getRestaurantReport } from "@/server/reports/restaurant-report";
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
let readerId = "";
const invoiceIds = [crypto.randomUUID(), crypto.randomUUID()] as const;

const actor = (userId: string, isOwner = false): Actor => ({ userId, isOwner, isElevated: true });
const range = (establishmentId: string) => ({
  establishmentId,
  from: "2026-10-01",
  to: "2026-10-07",
});

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  // Module Rapports actif dans A seulement ; un lecteur dans A.
  await db.prisma.establishmentModule.create({
    data: { establishmentId: fx.a.id, module: "reports", enabled: true },
  });
  const reader = await db.prisma.user.create({
    data: {
      email: "lecteur.a@optima.test",
      displayName: "Lecteur A",
      passwordHash: fx.owner.passwordHash,
      mustChangePassword: false,
    },
  });
  await db.prisma.membership.create({
    data: { userId: reader.id, establishmentId: fx.a.id, role: "reader" },
  });
  readerId = reader.id;
  await db.asApp();

  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone salle" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;

  const envelope = (type: string, payload: unknown, createdAt: string) => ({
    id: crypto.randomUUID(),
    type,
    establishmentId: fx.a.id,
    userId: fx.waiterA.id,
    deviceId: device.id,
    createdAt,
    schemaVersion: 1,
    payload,
  });
  const at = "2026-10-02T18:30:00.000Z"; // 20 h 30 à Bukavu.
  const results = await pushOperations(db.prisma, device, [
    envelope(
      "restaurant.order.created",
      {
        orderId: crypto.randomUUID(),
        number: `CMD-2026-${device.code}-000001`,
        createdAt: at,
        mode: "takeaway",
        tableId: null,
        lines: [
          { menuItemId: fx.a.beer.id, quantity: 2 },
          { menuItemId: fx.a.fries.id, quantity: 1 },
        ],
        invoices: [
          {
            id: invoiceIds[0],
            number: `FAC-2026-${device.code}-000001`,
            servicePointId: fx.a.counter.id,
          },
          {
            id: invoiceIds[1],
            number: `FAC-2026-${device.code}-000002`,
            servicePointId: fx.a.kitchen.id,
          },
        ],
      },
      at,
    ),
    envelope(
      "restaurant.payment.recorded",
      {
        payment: {
          id: crypto.randomUUID(),
          method: "cash",
          provider: null,
          reference: null,
          tendered: { amountMinor: 700_000, currency: "CDF" },
          rateId: null,
          changeMinor: 0,
          allocations: [{ invoiceId: invoiceIds[0], amountMinor: 700_000 }],
          createdAt: at,
        },
      },
      at,
    ),
  ]);
  expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("rapports (EF-RAP-01, EF-RAP-04, D-065)", () => {
  it("réservés au gérant, au lecteur et au propriétaire, module actif", async () => {
    await expect(
      getRestaurantReport(db.prisma, actor(fx.waiterA.id), range(fx.a.id)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getRestaurantReport(db.prisma, actor(fx.owner.id, true), range(fx.b.id)),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await expect(
      getRestaurantReport(db.prisma, actor(fx.managerA.id), {
        ...range(fx.a.id),
        from: "2026-10-07",
        to: "2026-10-01",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });

    const view = await getRestaurantReport(db.prisma, actor(readerId), range(fx.a.id));
    expect(view.sales.revenue).toEqual({ amountMinor: 1_100_000, currency: "CDF" });
    expect(view.sales.byPoint.map((point) => point.name)).toEqual(["Comptoir", "Cuisine"]);
    expect(view.sales.byHour.map((entry) => entry.hour)).toEqual([20]);
    expect(view.sales.byMethod).toEqual([
      { label: "Espèces (FC)", amount: { amountMinor: 700_000, currency: "CDF" } },
    ]);
    expect(view.sales.topItems[0]).toMatchObject({ quantity: 2 });
  });

  it("exporte en Excel et en CSV ; chaque export est audité", async () => {
    const xlsx = await exportRestaurantReport(db.prisma, actor(fx.managerA.id), {
      ...range(fx.a.id),
      format: "xlsx",
    });
    expect(xlsx.filename).toBe("rapport-2026-10-01-2026-10-07.xlsx");
    // Un classeur xlsx est une archive zip (« PK »).
    expect(Buffer.from(xlsx.base64, "base64").subarray(0, 2).toString()).toBe("PK");

    const csv = await exportRestaurantReport(db.prisma, actor(fx.managerA.id), {
      ...range(fx.a.id),
      format: "csv",
    });
    const text = Buffer.from(csv.base64, "base64").toString("utf8");
    expect(text).toContain("Journée;Heure;Facture;Point de service;Serveur;Article");
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(3);

    const audits = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      (tx) => tx.auditLog.count({ where: { action: "reports.exported" } }),
    );
    expect(audits).toBe(2);
  });
});
