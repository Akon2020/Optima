import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import {
  authenticateDevice,
  registerDevice,
  revokeDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let token: string;

const managerActor = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const registered = await registerDevice(db.prisma, managerActor(), {
    establishmentId: fx.a.id,
    name: "Téléphone salle 1",
  });
  token = registered.token;
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

let sequence = 0;
function orderOperation(
  overrides: { userId?: string; lines?: { menuItemId: string; quantity: number }[] } = {},
) {
  sequence += 1;
  const seq = String(sequence).padStart(6, "0");
  const lines = overrides.lines ?? [
    { menuItemId: fx.a.beer.id, quantity: 2 },
    { menuItemId: fx.a.fries.id, quantity: 1 },
  ];
  const points = new Set(
    lines.map((line) => (line.menuItemId === fx.a.fries.id ? fx.a.kitchen.id : fx.a.counter.id)),
  );
  return {
    id: crypto.randomUUID(),
    type: "restaurant.order.created",
    establishmentId: fx.a.id,
    userId: overrides.userId ?? fx.waiterA.id,
    deviceId: device.id,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: {
      orderId: crypto.randomUUID(),
      number: `CMD-2026-${device.code}-${seq}`,
      createdAt: new Date().toISOString(),
      mode: "dine-in",
      tableId: fx.a.table.id,
      lines,
      invoices: [...points].map((servicePointId, index) => ({
        id: crypto.randomUUID(),
        number: `FAC-2026-${device.code}-${String(sequence * 10 + index).padStart(6, "0")}`,
        servicePointId,
      })),
    },
  };
}

describe("appareils (EF-CPT-04, RG-OFF-02)", () => {
  it("attribue un code appareil et refuse un mauvais secret", async () => {
    expect(device.code).toBe("D01");
    expect(
      await authenticateDevice(db.prisma, `Device ${device.id}.mauvais-secret-de-test-xx`),
    ).toBeNull();
  });

  it("refuse l'enregistrement d'un appareil par un serveur", async () => {
    await expect(
      registerDevice(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: true },
        {
          establishmentId: fx.a.id,
          name: "Intrus",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("POST /api/sync/push (CLAUDE.md § 3.6)", () => {
  it("applique une commande avec les prix du serveur et une facture par point de service", async () => {
    const operation = orderOperation();
    const [result] = await pushOperations(db.prisma, device, [operation]);
    expect(result).toEqual({ id: operation.id, status: "accepted" });

    const stored = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      async (tx) => ({
        order: await tx.order.findUnique({ where: { id: operation.payload.orderId } }),
        invoices: await tx.advanceInvoice.findMany({
          where: { orderId: operation.payload.orderId },
        }),
        lines: await tx.invoiceLine.count({ where: { establishmentId: fx.a.id } }),
      }),
    );
    expect(stored.order?.totalMinor).toBe(1_100_000n);
    expect(stored.order?.tableLabel).toBe("Table 1");
    expect(stored.invoices).toHaveLength(2);
    expect(stored.lines).toBeGreaterThanOrEqual(2);
  });

  it("RG-OFF-01 : une opération envoyée deux fois n'est comptée qu'une fois", async () => {
    const operation = orderOperation();
    await pushOperations(db.prisma, device, [operation]);
    const [again] = await pushOperations(db.prisma, device, [operation]);
    expect(again).toEqual({ id: operation.id, status: "duplicate" });
  });

  it("EF-OFF-04 : refuse avec un motif un élément sans prix, et le conserve pour revue", async () => {
    const operation = orderOperation({ lines: [{ menuItemId: fx.a.noPrice.id, quantity: 1 }] });
    const [result] = await pushOperations(db.prisma, device, [operation]);
    expect(result).toMatchObject({ status: "rejected", code: "PRICE_NOT_SET" });
    const stored = await withContext(
      db.prisma,
      { establishmentId: fx.a.id, isOwner: false },
      (tx) => tx.syncOperation.findUnique({ where: { id: operation.id } }),
    );
    expect(stored?.status).toBe("rejected");
  });

  it("revalide les droits au moment de l'envoi : utilisateur suspendu entre-temps", async () => {
    await db.asAdmin();
    await db.prisma.user.update({ where: { id: fx.waiterA.id }, data: { status: "suspended" } });
    await db.asApp();
    const [result] = await pushOperations(db.prisma, device, [orderOperation()]);
    expect(result).toMatchObject({ status: "rejected", code: "USER_NOT_ALLOWED" });
    await db.asAdmin();
    await db.prisma.user.update({ where: { id: fx.waiterA.id }, data: { status: "active" } });
    await db.asApp();
  });

  it("refuse une opération que le rôle n'autorise pas (serveur et menu)", async () => {
    const [result] = await pushOperations(db.prisma, device, [
      {
        id: crypto.randomUUID(),
        type: "restaurant.menu-item.created",
        establishmentId: fx.a.id,
        userId: fx.waiterA.id,
        deviceId: device.id,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          item: {
            id: crypto.randomUUID(),
            servicePointId: fx.a.counter.id,
            name: "Nouvelle bière",
            description: "",
            category: "Bières",
            unit: "bottle",
            price: { amountMinor: 300_000, currency: "CDF" },
          },
        },
      },
    ]);
    expect(result).toMatchObject({ status: "rejected", code: "FORBIDDEN" });
  });

  it("refuse un numéro de document d'un autre appareil (EF-DOC-01)", async () => {
    const operation = orderOperation();
    operation.payload.number = operation.payload.number.replace(device.code, "D09");
    const [result] = await pushOperations(db.prisma, device, [operation]);
    expect(result).toMatchObject({ status: "rejected", code: "NUMBER_DEVICE_MISMATCH" });
  });

  it("refuse une opération destinée à un autre établissement", async () => {
    const operation = { ...orderOperation(), establishmentId: fx.b.id };
    const [result] = await pushOperations(db.prisma, device, [operation]);
    expect(result).toMatchObject({ status: "rejected", code: "DEVICE_MISMATCH" });
  });
});

describe("GET /api/sync/pull", () => {
  it("renvoie les changements de l'établissement depuis un curseur monotone", async () => {
    const first = await pullChanges(db.prisma, device, null);
    expect(first.changes.length).toBeGreaterThan(0);
    expect(first.changes.map((change) => change.entity)).toContain("order");
    const next = await pullChanges(db.prisma, device, first.cursor);
    expect(next.changes).toHaveLength(0);
  });

  it("un appareil d'un autre établissement ne voit rien de A", async () => {
    await db.asAdmin();
    const managerB = await db.prisma.user.create({
      data: {
        email: "gerant.b@optima.test",
        displayName: "Gérant B",
        passwordHash: "x",
        mustChangePassword: false,
      },
    });
    await db.prisma.membership.create({
      data: { userId: managerB.id, establishmentId: fx.b.id, role: "manager" },
    });
    await db.asApp();
    const other = await registerDevice(
      db.prisma,
      { userId: managerB.id, isOwner: false, isElevated: true },
      { establishmentId: fx.b.id, name: "Tablette B" },
    );
    const deviceB = await authenticateDevice(db.prisma, `Device ${other.token}`);
    if (!deviceB) throw new Error("appareil attendu");
    const pulled = await pullChanges(db.prisma, deviceB, null);
    expect(pulled.changes).toHaveLength(0);
  });

  it("un appareil révoqué n'est plus reconnu", async () => {
    await revokeDevice(db.prisma, managerActor(), {
      establishmentId: fx.a.id,
      deviceId: device.id,
      reason: "Téléphone perdu",
    });
    expect(await authenticateDevice(db.prisma, `Device ${token}`)).toBeNull();
  });
});
