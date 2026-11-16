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

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let cookId = "";
const DAY = "2026-11-16";
const invoices = [crypto.randomUUID(), crypto.randomUUID()] as const;

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  // Un cuisinier affecté à la cuisine de A (matrice : « son poste »).
  const cook = await db.prisma.user.create({
    data: {
      email: "cuisine.a@optima.test",
      displayName: "Cuisinier A",
      passwordHash: fx.owner.passwordHash,
      mustChangePassword: false,
    },
  });
  await db.prisma.membership.create({
    data: {
      userId: cook.id,
      establishmentId: fx.a.id,
      role: "prep",
      servicePointId: fx.a.kitchen.id,
    },
  });
  cookId = cook.id;
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Écran cuisine" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;

  const [created] = await pushOperations(db.prisma, device, [
    envelope(fx.waiterA.id, "restaurant.order.created", {
      orderId: crypto.randomUUID(),
      number: `CMD-2026-${device.code}-000001`,
      createdAt: new Date().toISOString(),
      mode: "takeaway",
      tableId: null,
      lines: [
        { menuItemId: fx.a.beer.id, quantity: 1 },
        { menuItemId: fx.a.fries.id, quantity: 1 },
      ],
      invoices: [
        {
          id: invoices[0],
          number: `FAC-2026-${device.code}-000001`,
          servicePointId: fx.a.counter.id,
        },
        {
          id: invoices[1],
          number: `FAC-2026-${device.code}-000002`,
          servicePointId: fx.a.kitchen.id,
        },
      ],
    }),
  ]);
  expect(created?.status).toBe("accepted");
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function envelope(userId: string, type: string, payload: unknown) {
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

async function push(userId: string, type: string, payload: unknown) {
  const [result] = await pushOperations(db.prisma, device, [envelope(userId, type, payload)]);
  return result && "code" in result ? result.code : result?.status;
}

describe("postes de préparation (EF-PRE-02, EF-PRE-03, D-066)", () => {
  it("le préparateur ne travaille que pour son poste", async () => {
    const prep = (invoiceId: string) =>
      push(cookId, "restaurant.invoice.prep-status-changed", { invoiceId, status: "ready" });
    expect(await prep(invoices[0])).toBe("NOT_YOUR_STATION");
    expect(await prep(invoices[1])).toBe("accepted");
  });

  it("EF-PRE-03 : déclarer épuisé est audité et diffusé ; le serveur ne le peut pas", async () => {
    const soldOut = (userId: string, itemId: string, isSoldOut = true) =>
      push(userId, "restaurant.menu-item.sold-out-set", { itemId, day: DAY, isSoldOut });
    expect(await soldOut(fx.waiterA.id, fx.a.fries.id)).toBe("FORBIDDEN");
    expect(await soldOut(cookId, fx.a.beer.id)).toBe("NOT_YOUR_STATION");
    expect(await soldOut(cookId, fx.a.fries.id)).toBe("accepted");

    const { item, audit } = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      async (tx) => ({
        item: await tx.menuItem.findUniqueOrThrow({ where: { id: fx.a.fries.id } }),
        audit: await tx.auditLog.findFirst({
          where: { action: "restaurant.menu-item.sold-out-set", entityId: fx.a.fries.id },
        }),
      }),
    );
    expect(item.soldOutDay).toBe(DAY);
    expect(audit?.actorUserId).toBe(cookId);

    // L'état initial d'un appareil porte l'élément épuisé et le poste du préparateur.
    const bootstrap = await buildBootstrap(db.prisma, device);
    expect(bootstrap.menuItems.find((entry) => entry.id === fx.a.fries.id)?.soldOutDay).toBe(DAY);
    expect(bootstrap.staff.find((member) => member.id === cookId)?.servicePointId).toBe(
      fx.a.kitchen.id,
    );

    // Le gérant le remet en vente.
    expect(await soldOut(fx.managerA.id, fx.a.fries.id, false)).toBe("accepted");
  });
});
