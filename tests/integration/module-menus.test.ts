import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import { setModuleEnabled } from "@/server/owner/establishments";
import { buildBootstrap } from "@/server/sync/bootstrap";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

/** Menus selon les modules actifs (EF-MOD-02) sans perte de données (RG-MOD-01). */
let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;

const owner = () => ({ userId: fx.owner.id, isOwner: true, isElevated: true });
const manager = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const { token } = await registerDevice(db.prisma, manager(), {
    establishmentId: fx.a.id,
    name: "Téléphone salle",
  });
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function orderOperation(sequence: number) {
  const number = String(sequence).padStart(6, "0");
  return {
    id: crypto.randomUUID(),
    type: "restaurant.order.created",
    establishmentId: fx.a.id,
    userId: fx.waiterA.id,
    deviceId: device.id,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: {
      orderId: crypto.randomUUID(),
      number: `CMD-2026-${device.code}-${number}`,
      createdAt: new Date().toISOString(),
      mode: "takeaway",
      tableId: null,
      lines: [{ menuItemId: fx.a.beer.id, quantity: 1 }],
      invoices: [
        {
          id: crypto.randomUUID(),
          number: `FAC-2026-${device.code}-${number}`,
          servicePointId: fx.a.counter.id,
        },
      ],
    },
  };
}

describe("modules actifs sur les appareils", () => {
  it("l'état initial donne la liste des modules actifs", async () => {
    const snapshot = await buildBootstrap(db.prisma, device);
    expect(snapshot.modules).toEqual(["catalog", "documents", "restaurant", "sales", "stock"]);
  });

  it("chaque changement de module est diffusé aux appareils", async () => {
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "delivery",
      enabled: true,
    });
    const { changes } = await pullChanges(db.prisma, device, null);
    const last = changes.filter((change) => change.entity === "establishment_modules").at(-1);
    expect(last?.data).toEqual({
      modules: ["catalog", "delivery", "documents", "restaurant", "sales", "stock"],
    });
  });
});

describe("opérations d'un module désactivé (RG-MOD-01)", () => {
  it("restent en attente sur l'appareil, puis passent à la réactivation", async () => {
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "delivery",
      enabled: false,
    });
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "restaurant",
      enabled: false,
    });
    const operation = orderOperation(1);
    const [waiting] = await pushOperations(db.prisma, device, [operation]);
    expect(waiting).toMatchObject({ status: "retry" });
    // Rien n'est enregistré : l'opération pourra être renvoyée telle quelle.
    const stored = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      (tx) => tx.syncOperation.findUnique({ where: { id: operation.id } }),
    );
    expect(stored).toBeNull();

    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "restaurant",
      enabled: true,
    });
    const [accepted] = await pushOperations(db.prisma, device, [operation]);
    expect(accepted).toMatchObject({ status: "accepted" });
  });
});
