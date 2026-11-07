import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";

import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

export type TestDb = {
  pg: PGlite;
  prisma: PrismaClient;
  /** Bascule sur le rôle applicatif (RLS appliquée, comme en production). */
  asApp: () => Promise<void>;
  /** Revient au super-utilisateur (préparation des données). */
  asAdmin: () => Promise<void>;
};

/** Base PostgreSQL neuve avec toutes les migrations du dépôt. */
export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE optima_app NOLOGIN NOSUPERUSER NOBYPASSRLS;");
  for (const directory of readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, directory, "migration.sql"), "utf8"));
  }
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  return {
    pg,
    prisma,
    asApp: async () => {
      await pg.exec("SET ROLE optima_app;");
    },
    asAdmin: async () => {
      await pg.exec("RESET ROLE;");
    },
  };
}

export const PASSWORD = "Mot de passe de test 2026";

export type Fixtures = Awaited<ReturnType<typeof createFixtures>>;

/**
 * Deux établissements isolés, un propriétaire et du personnel. À appeler en
 * super-utilisateur, avant `asApp()`.
 */
export async function createFixtures(prisma: PrismaClient) {
  const passwordHash = await hashPassword(PASSWORD);
  const owner = await prisma.user.create({
    data: {
      email: "proprietaire@optima.test",
      displayName: "Propriétaire",
      passwordHash,
      mustChangePassword: false,
      isOwner: true,
    },
  });

  async function establishment(slug: string, name: string) {
    const created = await prisma.establishment.create({
      data: { slug, name, type: "restaurant", baseCurrency: "CDF" },
    });
    await prisma.establishmentModule.createMany({
      data: ["catalog", "stock", "sales", "documents", "restaurant"].map((module) => ({
        establishmentId: created.id,
        module,
        enabled: true,
      })),
    });
    const counter = await prisma.servicePoint.create({
      data: {
        establishmentId: created.id,
        kind: "counter",
        name: "Comptoir",
        menu: "drinks",
        sortOrder: 1,
      },
    });
    const kitchen = await prisma.servicePoint.create({
      data: {
        establishmentId: created.id,
        kind: "kitchen",
        name: "Cuisine",
        menu: "food",
        sortOrder: 2,
      },
    });
    const beer = await prisma.menuItem.create({
      data: {
        establishmentId: created.id,
        servicePointId: counter.id,
        name: "Primus 72 cl",
        unit: "bottle",
        priceMinor: 350_000n,
        currency: "CDF",
      },
    });
    const fries = await prisma.menuItem.create({
      data: {
        establishmentId: created.id,
        servicePointId: kitchen.id,
        name: "Frites",
        unit: "dish",
        priceMinor: 400_000n,
        currency: "CDF",
      },
    });
    const noPrice = await prisma.menuItem.create({
      data: {
        establishmentId: created.id,
        servicePointId: counter.id,
        name: "Vin rouge",
        unit: "bottle",
        priceMinor: null,
        currency: "CDF",
      },
    });
    const table = await prisma.diningTable.create({
      data: { establishmentId: created.id, label: "Table 1", sortOrder: 1 },
    });
    return { ...created, counter, kitchen, beer, fries, noPrice, table };
  }

  const a = await establishment("restaurant-a", "Restaurant A");
  const b = await establishment("restaurant-b", "Restaurant B");

  async function member(email: string, establishmentId: string, role: "manager" | "waiter") {
    const user = await prisma.user.create({
      data: {
        email,
        displayName: email.split("@")[0] ?? email,
        passwordHash,
        mustChangePassword: false,
      },
    });
    await prisma.membership.create({ data: { userId: user.id, establishmentId, role } });
    return user;
  }

  return {
    owner,
    a,
    b,
    managerA: await member("gerant.a@optima.test", a.id, "manager"),
    waiterA: await member("serveur.a@optima.test", a.id, "waiter"),
    waiterB: await member("serveur.b@optima.test", b.id, "waiter"),
  };
}
