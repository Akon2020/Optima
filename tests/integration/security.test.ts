import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";

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

const ctx = (establishmentId: string | null, isOwner = false) => ({ establishmentId, isOwner });

describe("isolation des établissements (ENF-08, RLS)", () => {
  it("ne voit que les lignes de l'établissement du contexte", async () => {
    const items = await withContext(db.prisma, ctx(fx.a.id), (tx) => tx.menuItem.findMany());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.establishmentId === fx.a.id)).toBe(true);
  });

  it("ne voit rien sans contexte", async () => {
    expect(await db.prisma.menuItem.count()).toBe(0);
  });

  it("refuse d'écrire dans un autre établissement", async () => {
    await expect(
      withContext(db.prisma, ctx(fx.a.id), (tx) =>
        tx.diningTable.create({
          data: { establishmentId: fx.b.id, label: "Intrus", sortOrder: 99 },
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuse de lire une ressource d'un autre établissement par son identifiant (IDOR)", async () => {
    const found = await withContext(db.prisma, ctx(fx.a.id), (tx) =>
      tx.menuItem.findUnique({ where: { id: fx.b.beer.id } }),
    );
    expect(found).toBeNull();
  });

  it("le propriétaire vérifié lit tous les établissements, sans écrire hors contexte", async () => {
    const items = await withContext(db.prisma, ctx(null, true), (tx) => tx.menuItem.findMany());
    expect(new Set(items.map((item) => item.establishmentId))).toEqual(new Set([fx.a.id, fx.b.id]));
  });
});

describe("tables en ajout seul (RG-AUD-01, RG-STK-01)", () => {
  it("refuse la modification et la suppression du journal d'audit", async () => {
    const entry = await withContext(db.prisma, ctx(fx.a.id), (tx) =>
      tx.auditLog.create({
        data: { establishmentId: fx.a.id, action: "test", entity: "test" },
      }),
    );
    await expect(
      withContext(db.prisma, ctx(fx.a.id), (tx) =>
        tx.auditLog.update({ where: { id: entry.id }, data: { action: "falsifié" } }),
      ),
    ).rejects.toThrow();
    await expect(
      withContext(db.prisma, ctx(fx.a.id), (tx) => tx.auditLog.delete({ where: { id: entry.id } })),
    ).rejects.toThrow();
  });

  it("refuse la modification d'une saisie de stock du matin", async () => {
    const entry = await withContext(db.prisma, ctx(fx.a.id), (tx) =>
      tx.morningStockEntry.create({
        data: {
          id: crypto.randomUUID(),
          establishmentId: fx.a.id,
          day: "2026-11-07",
          servicePointId: fx.a.counter.id,
          menuItemId: fx.a.beer.id,
          quantity: 24,
          enteredAt: new Date(),
          enteredBy: fx.managerA.id,
        },
      }),
    );
    await expect(
      withContext(db.prisma, ctx(fx.a.id), (tx) =>
        tx.morningStockEntry.update({ where: { id: entry.id }, data: { quantity: 99 } }),
      ),
    ).rejects.toThrow();
  });

  it("le rôle applicatif ne peut pas supprimer de données métier", async () => {
    await expect(
      withContext(db.prisma, ctx(fx.a.id), (tx) =>
        tx.diningTable.delete({ where: { id: fx.a.table.id } }),
      ),
    ).rejects.toThrow();
  });
});
