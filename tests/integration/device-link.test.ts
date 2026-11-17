import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyDeviceUser } from "@/server/auth/device-users";
import { withContext } from "@/server/db/context";
import { buildBootstrap } from "@/server/sync/bootstrap";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";
import { pushOperations } from "@/server/sync/push";

import {
  PASSWORD,
  createFixtures,
  createTestDb,
  type Fixtures,
  type TestDb,
} from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const registered = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone salle" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${registered.token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

const meta = { ip: "10.9.0.1" };

describe("état initial d'un appareil (GET /api/sync/bootstrap)", () => {
  it("ne contient que l'établissement de l'appareil", async () => {
    const snapshot = await buildBootstrap(db.prisma, device);
    expect(snapshot.establishment).toMatchObject({
      id: fx.a.id,
      slug: "restaurant-a",
      currency: "CDF",
    });
    expect(snapshot.device.code).toBe("D01");
    expect(snapshot.servicePoints).toHaveLength(2);
    expect(snapshot.menuItems.every((item) => item.establishmentId === fx.a.id)).toBe(true);
    expect(snapshot.menuItems.find((item) => item.name === "Primus 72 cl")?.price).toEqual({
      amountMinor: 350_000,
      currency: "CDF",
    });
    expect(snapshot.staff.map((member) => member.name).sort()).toEqual(["gerant.a", "serveur.a"]);
    expect(snapshot.tables[0]?.label).toBe("Table 1");
  });
});

describe("connexion d'un membre sur l'appareil (EF-AUT-01, RG-OFF-02)", () => {
  it("accepte un membre de l'établissement", async () => {
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "serveur.a@optima.test", password: PASSWORD },
        meta,
      ),
    ).resolves.toMatchObject({ userId: fx.waiterA.id, role: "waiter" });
  });

  it("refuse un mauvais mot de passe, un autre établissement et le propriétaire", async () => {
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "serveur.a@optima.test", password: "faux" },
        meta,
      ),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "serveur.b@optima.test", password: PASSWORD },
        meta,
      ),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "proprietaire@optima.test", password: PASSWORD },
        meta,
      ),
    ).rejects.toMatchObject({ code: "OWNER_NOT_ON_DEVICE" });
  });

  it("exige d'abord le changement du mot de passe provisoire", async () => {
    await db.asAdmin();
    await db.prisma.user.update({
      where: { id: fx.managerA.id },
      data: { mustChangePassword: true },
    });
    await db.asApp();
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "gerant.a@optima.test", password: PASSWORD },
        meta,
      ),
    ).rejects.toMatchObject({ code: "MUST_CHANGE_PASSWORD" });
  });

  it("journalise un refus comme un refus, avec son motif, jamais comme une connexion", async () => {
    const lastDeviceLogin = () =>
      withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
        tx.auditLog.findFirst({
          where: { action: { startsWith: "auth.device-login." } },
          orderBy: { id: "desc" },
        }),
      );
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "proprietaire@optima.test", password: PASSWORD },
        meta,
      ),
    ).rejects.toMatchObject({ code: "OWNER_NOT_ON_DEVICE" });
    expect(await lastDeviceLogin()).toMatchObject({
      action: "auth.device-login.refused",
      actorUserId: fx.owner.id,
      actorRole: "owner",
      reason: "OWNER_NOT_ON_DEVICE",
    });
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        { identifier: "gerant.a@optima.test", password: PASSWORD },
        meta,
      ),
    ).rejects.toMatchObject({ code: "MUST_CHANGE_PASSWORD" });
    expect(await lastDeviceLogin()).toMatchObject({
      action: "auth.device-login.refused",
      actorRole: "manager",
      reason: "MUST_CHANGE_PASSWORD",
    });
    await db.asAdmin();
    await db.prisma.user.update({
      where: { id: fx.managerA.id },
      data: { mustChangePassword: false },
    });
    await db.asApp();
    await verifyDeviceUser(
      db.prisma,
      device,
      { identifier: "gerant.a@optima.test", password: PASSWORD },
      meta,
    );
    expect(await lastDeviceLogin()).toMatchObject({
      action: "auth.device-login.succeeded",
      actorRole: "manager",
    });
  });
});

describe("changements diffusés aux autres appareils", () => {
  it("une commande arrive complète : lignes, prix du serveur, nom du serveur, code appareil", async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = crypto.randomUUID();
    const [result] = await pushOperations(db.prisma, device, [
      {
        id: crypto.randomUUID(),
        type: "restaurant.order.created",
        establishmentId: fx.a.id,
        userId: fx.waiterA.id,
        deviceId: device.id,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          orderId,
          number: `CMD-2026-${device.code}-000001`,
          createdAt: new Date().toISOString(),
          mode: "takeaway",
          tableId: null,
          lines: [{ menuItemId: fx.a.beer.id, quantity: 3 }],
          invoices: [
            {
              id: invoiceId,
              number: `FAC-2026-${device.code}-000001`,
              servicePointId: fx.a.counter.id,
            },
          ],
        },
      },
    ]);
    expect(result?.status).toBe("accepted");
    const { changes } = await pullChanges(db.prisma, device, null);
    const order = changes.find((change) => change.entity === "order")?.data as {
      lines: { quantity: number; unitPrice: { amountMinor: number } }[];
      waiterName: string;
      deviceCode: string;
      invoiceIds: string[];
      total: { amountMinor: number };
    };
    expect(order.lines[0]).toMatchObject({ quantity: 3, unitPrice: { amountMinor: 350_000 } });
    expect(order.waiterName).toBe("serveur.a");
    expect(order.deviceCode).toBe("D01");
    expect(order.invoiceIds).toEqual([invoiceId]);
    expect(order.total.amountMinor).toBe(1_050_000);
    const invoice = changes.find((change) => change.entity === "advance_invoice")?.data as {
      prepStatus: string;
      paymentStatus: string;
    };
    expect(invoice).toMatchObject({ prepStatus: "pending", paymentStatus: "unpaid" });
  });
});
