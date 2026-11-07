import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authenticateDevice,
  listDevices,
  registerDevice,
  revokeDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

/** Écran « Appareils » (EF-CPT-04, ENF-09, EF-AUD-01). */
let db: TestDb;
let fx: Fixtures;
let hall: AuthenticatedDevice;
let hallToken: string;
let counterDeviceId: string;
let otherEstablishmentDeviceId: string;

const manager = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });
const owner = () => ({ userId: fx.owner.id, isOwner: true, isElevated: true });

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const first = await registerDevice(db.prisma, manager(), {
    establishmentId: fx.a.id,
    name: "Téléphone salle 1",
  });
  hallToken = first.token;
  const authenticated = await authenticateDevice(db.prisma, `Device ${hallToken}`);
  if (!authenticated) throw new Error("appareil attendu");
  hall = authenticated;
  counterDeviceId = (
    await registerDevice(db.prisma, manager(), {
      establishmentId: fx.a.id,
      name: "Tablette comptoir",
    })
  ).deviceId;
  otherEstablishmentDeviceId = (
    await registerDevice(db.prisma, owner(), { establishmentId: fx.b.id, name: "Caisse B" })
  ).deviceId;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("liste des appareils", () => {
  it("ne montre que les appareils de l'établissement, avec leur auteur", async () => {
    const { establishment, devices } = await listDevices(db.prisma, manager(), {
      establishmentId: fx.a.id,
    });
    expect(establishment.name).toBe("Restaurant A");
    expect(devices.map((device) => device.code).sort()).toEqual(["D01", "D02"]);
    expect(devices.every((device) => device.registeredByName === "gerant.a")).toBe(true);
    expect(devices.some((device) => device.id === otherEstablishmentDeviceId)).toBe(false);
    expect(devices.every((device) => device.lastSyncAt === null)).toBe(true);
  });

  it("la dernière synchronisation suit aussi la réception, et les refus sont comptés", async () => {
    await pullChanges(db.prisma, hall, null);
    await pushOperations(db.prisma, hall, [
      {
        id: crypto.randomUUID(),
        type: "restaurant.order.created",
        establishmentId: fx.a.id,
        userId: fx.waiterA.id,
        deviceId: hall.id,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          orderId: crypto.randomUUID(),
          number: `CMD-2026-${hall.code}-000001`,
          createdAt: new Date().toISOString(),
          mode: "takeaway",
          tableId: null,
          // RG-PRX-01 : un élément sans prix ne se vend pas, l'opération est refusée.
          lines: [{ menuItemId: fx.a.noPrice.id, quantity: 1 }],
          invoices: [
            {
              id: crypto.randomUUID(),
              number: `FAC-2026-${hall.code}-000001`,
              servicePointId: fx.a.counter.id,
            },
          ],
        },
      },
    ]);
    const { devices } = await listDevices(db.prisma, manager(), { establishmentId: fx.a.id });
    const listed = devices.find((device) => device.id === hall.id);
    expect(listed?.lastSyncAt).not.toBeNull();
    expect(listed?.rejectedOperations).toBe(1);
    expect(devices.find((device) => device.id === counterDeviceId)?.rejectedOperations).toBe(0);
  });

  it("est réservée au gérant de l'établissement et au propriétaire authentifié", async () => {
    await expect(
      listDevices(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: false },
        { establishmentId: fx.a.id },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listDevices(
        db.prisma,
        { userId: fx.waiterB.id, isOwner: false, isElevated: false },
        { establishmentId: fx.a.id },
      ),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(
      listDevices(
        db.prisma,
        { userId: fx.owner.id, isOwner: true, isElevated: false },
        { establishmentId: fx.a.id },
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    await expect(
      listDevices(db.prisma, owner(), { establishmentId: fx.b.id }),
    ).resolves.toMatchObject({ devices: [{ code: "D01", name: "Caisse B" }] });
  });
});

describe("révocation", () => {
  it("exige un motif et refuse l'appareil d'un autre établissement (IDOR)", async () => {
    await expect(
      revokeDevice(db.prisma, manager(), {
        establishmentId: fx.a.id,
        deviceId: hall.id,
        reason: " ",
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(
      revokeDevice(db.prisma, manager(), {
        establishmentId: fx.a.id,
        deviceId: hall.id,
        reason: "x".repeat(201),
      }),
    ).rejects.toMatchObject({ code: "REASON_TOO_LONG" });
    await expect(
      revokeDevice(db.prisma, manager(), {
        establishmentId: fx.a.id,
        deviceId: otherEstablishmentDeviceId,
        reason: "Appareil perdu",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("coupe l'appareil, garde le motif et l'auteur, et ne se fait qu'une fois", async () => {
    await revokeDevice(
      db.prisma,
      manager(),
      { establishmentId: fx.a.id, deviceId: hall.id, reason: "Appareil volé" },
      { ip: "10.1.2.3" },
    );
    expect(await authenticateDevice(db.prisma, `Device ${hallToken}`)).toBeNull();

    const { devices } = await listDevices(db.prisma, manager(), { establishmentId: fx.a.id });
    expect(devices.find((device) => device.id === hall.id)).toMatchObject({
      revokedReason: "Appareil volé",
      revokedByName: "gerant.a",
    });
    expect(devices.find((device) => device.id === counterDeviceId)?.revokedAt).toBeNull();

    await expect(
      revokeDevice(db.prisma, manager(), {
        establishmentId: fx.a.id,
        deviceId: hall.id,
        reason: "Encore",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
