import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_BUSINESS_DAY_START_HOUR,
  businessDayKey,
  businessDayStartOf,
} from "@/modules/restaurant/domain/business-day";
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
 * Réquisitions (EF-REQ-02, RG-REQ-01, D-069) : droits, genre recalculé par
 * le serveur, retour avec motif, audit, diffusion, ajout seul, et prise en
 * compte des compléments dans le stock attendu du comptage (EF-CLO-03).
 */
let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
// Journée d'aujourd'hui : l'état initial d'un appareil ne couvre que les jours récents.
const TIME_ZONE = "Africa/Lubumbashi";
const DAY = businessDayKey(new Date().toISOString(), DEFAULT_BUSINESS_DAY_START_HOUR, TIME_ZONE);
const DAY_START = new Date(businessDayStartOf(DAY, DEFAULT_BUSINESS_DAY_START_HOUR, TIME_ZONE));
/** Heure de la journée, en heures après son début (6 h locales). */
const at = (hours: number) => new Date(DAY_START.getTime() + hours * 3_600_000).toISOString();
let sequence = 0;

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone du gérant" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

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

function requisition(input: {
  kind?: "main" | "complement" | "return";
  servicePointId?: string;
  menuItemId?: string;
  quantity?: number;
  comment?: string | null;
  createdAt: string;
}) {
  sequence += 1;
  const id = crypto.randomUUID();
  return {
    id,
    payload: {
      requisition: {
        id,
        number: `REQ-2026-${device.code}-${String(sequence).padStart(6, "0")}`,
        day: DAY,
        servicePointId: input.servicePointId ?? fx.a.counter.id,
        kind: input.kind ?? "main",
        lines: [{ menuItemId: input.menuItemId ?? fx.a.beer.id, quantity: input.quantity ?? 24 }],
        comment: input.comment ?? null,
        createdAt: input.createdAt,
      },
    },
  };
}

async function stored(id: string) {
  return withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
    tx.requisition.findUniqueOrThrow({ where: { id } }),
  );
}

describe("réquisitions (D-069)", () => {
  it("seul le gérant fait sortir du magasin ; éléments du point de service seulement", async () => {
    const forWaiter = requisition({ createdAt: at(1) });
    expect(await push(fx.waiterA.id, "restaurant.requisition.created", forWaiter.payload)).toBe(
      "FORBIDDEN",
    );
    const wrongItem = requisition({
      menuItemId: fx.a.fries.id,
      createdAt: at(1),
    });
    expect(await push(fx.managerA.id, "restaurant.requisition.created", wrongItem.payload)).toBe(
      "ITEM_NOT_FOUND",
    );
    const noReason = requisition({ kind: "return", createdAt: at(1) });
    expect(await push(fx.managerA.id, "restaurant.requisition.created", noReason.payload)).toBe(
      "REASON_REQUIRED",
    );
  });

  it("avant le stock du matin : principale, auditée, diffusée et en ajout seul", async () => {
    const main = requisition({ quantity: 48, createdAt: at(1) });
    expect(await push(fx.managerA.id, "restaurant.requisition.created", main.payload)).toBe(
      "accepted",
    );
    const row = await stored(main.id);
    expect(row.kind).toBe("main");
    expect(row.lines).toEqual([
      { menuItemId: fx.a.beer.id, name: fx.a.beer.name, unit: fx.a.beer.unit, quantity: 48 },
    ]);

    const { audit, change } = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      async (tx) => ({
        audit: await tx.auditLog.findFirst({
          where: { action: "restaurant.requisition.created", entityId: main.id },
        }),
        change: await tx.changeLog.findFirst({
          where: { entity: "requisition", entityId: main.id },
        }),
      }),
    );
    expect(audit?.actorUserId).toBe(fx.managerA.id);
    expect(change).not.toBeNull();

    // RG-REQ-01 : une réquisition ne se modifie plus.
    await expect(
      withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
        tx.requisition.update({ where: { id: main.id }, data: { comment: "modifiée" } }),
      ),
    ).rejects.toThrow();
  });

  it("après un stock du matin saisi ailleurs, le serveur la classe en complément", async () => {
    expect(
      await push(fx.managerA.id, "restaurant.morning-stock.entered", {
        day: DAY,
        servicePointId: fx.a.counter.id,
        entries: [
          {
            id: crypto.randomUUID(),
            menuItemId: fx.a.beer.id,
            quantity: 48,
            proposed: 48,
            reason: null,
            replacesId: null,
            enteredAt: at(2),
          },
        ],
      }),
    ).toBe("accepted");
    // L'appareil, hors connexion, croyait encore la faire « du matin ».
    const late = requisition({ kind: "main", quantity: 24, createdAt: at(8) });
    expect(await push(fx.managerA.id, "restaurant.requisition.created", late.payload)).toBe(
      "accepted",
    );
    expect((await stored(late.id)).kind).toBe("complement");

    const back = requisition({
      kind: "return",
      quantity: 6,
      comment: "Surplus rendu",
      createdAt: at(9),
    });
    expect(await push(fx.managerA.id, "restaurant.requisition.created", back.payload)).toBe(
      "accepted",
    );

    // EF-CLO-03 : le comptage relit compléments et retours (24 − 6).
    const countId = crypto.randomUUID();
    expect(
      await push(fx.managerA.id, "restaurant.stock.counted", {
        count: {
          id: countId,
          day: DAY,
          servicePointId: fx.a.counter.id,
          countedAt: at(16),
          lines: [{ menuItemId: fx.a.beer.id, counted: 66, declaredOut: 0, outReason: null }],
          comment: null,
        },
      }),
    ).toBe("accepted");
    const count = await withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
      tx.stockCount.findUniqueOrThrow({ where: { id: countId } }),
    );
    expect(count.lines).toEqual([
      expect.objectContaining({ menuItemId: fx.a.beer.id, morning: 48, requisitioned: 18 }),
    ]);

    // L'état initial d'un nouvel appareil porte les réquisitions récentes.
    const bootstrap = await buildBootstrap(db.prisma, device);
    expect(bootstrap.requisitions.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([late.id, back.id]),
    );
  });

  it("RLS : un autre établissement ne voit pas ces réquisitions", async () => {
    const rows = await withContext(db.prisma, { establishmentId: fx.b.id, isOwner: false }, (tx) =>
      tx.requisition.findMany(),
    );
    expect(rows).toEqual([]);
  });
});
