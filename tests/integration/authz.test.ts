import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authorize, type Actor } from "@/server/authz/authorize";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

const member = (userId: string): Actor => ({ userId, isOwner: false, isElevated: true });

describe("authorize (CLAUDE.md § 5.3, matrice des droits)", () => {
  it("autorise un serveur à prendre une commande dans son établissement", async () => {
    const access = await authorize(db.prisma, member(fx.waiterA.id), "restaurant.order.create", {
      establishmentId: fx.a.id,
    });
    expect(access).toMatchObject({ role: "waiter", establishmentId: fx.a.id });
  });

  it("refuse l'accès sans session", async () => {
    await expect(
      authorize(db.prisma, null, "restaurant.menu.read", { establishmentId: fx.a.id }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("ENF-08 : refuse un établissement dont on n'est pas membre", async () => {
    await expect(
      authorize(db.prisma, member(fx.waiterB.id), "restaurant.order.create", {
        establishmentId: fx.a.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("refuse une action hors du rôle (serveur et menu)", async () => {
    await expect(
      authorize(db.prisma, member(fx.waiterA.id), "restaurant.menu.manage", {
        establishmentId: fx.a.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RG-CMD-03 : un serveur n'agit que sur ses propres ressources, le gérant sur toutes", async () => {
    const target = { establishmentId: fx.a.id, resourceOwnerId: fx.managerA.id, ownOnly: true };
    await expect(
      authorize(db.prisma, member(fx.waiterA.id), "restaurant.order.create", target),
    ).rejects.toMatchObject({ code: "NOT_OWNER" });
    await expect(
      authorize(db.prisma, member(fx.managerA.id), "restaurant.order.create", {
        ...target,
        resourceOwnerId: fx.waiterA.id,
      }),
    ).resolves.toMatchObject({ role: "manager" });
  });

  it("le propriétaire vérifié agit dans tout établissement (EF-PRO-06)", async () => {
    await expect(
      authorize(
        db.prisma,
        { userId: fx.owner.id, isOwner: true, isElevated: true },
        "restaurant.menu.manage",
        {
          establishmentId: fx.b.id,
        },
      ),
    ).resolves.toMatchObject({ role: "owner" });
  });

  it("RG-MOD-01 : refuse une fonctionnalité dont le module est désactivé", async () => {
    await db.asAdmin();
    await db.prisma.establishmentModule.update({
      where: { establishmentId_module: { establishmentId: fx.b.id, module: "restaurant" } },
      data: { enabled: false },
    });
    await db.asApp();
    await expect(
      authorize(db.prisma, member(fx.waiterB.id), "restaurant.order.create", {
        establishmentId: fx.b.id,
      }),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
  });

  it("EF-ETB-03 : refuse tout accès à un établissement suspendu", async () => {
    await db.asAdmin();
    await db.prisma.establishment.update({ where: { id: fx.b.id }, data: { status: "suspended" } });
    await db.asApp();
    await expect(
      authorize(
        db.prisma,
        { userId: fx.owner.id, isOwner: true, isElevated: true },
        "restaurant.menu.read",
        {
          establishmentId: fx.b.id,
        },
      ),
    ).rejects.toMatchObject({ code: "ESTABLISHMENT_SUSPENDED" });
  });
});
