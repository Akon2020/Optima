/**
 * Prépare la base des tests de bout en bout (D-062), lancé par
 * `tests/e2e/global-setup.ts` avant chaque `pnpm test:e2e` :
 *   1. vérifie que la base `optima_e2e` répond (sinon, en local, les parcours
 *      qui exigent le serveur sont sautés ; en CI, c'est une erreur) ;
 *   2. applique les migrations (rôle des migrations) ;
 *   3. vide toutes les tables (la base ne sert qu'aux tests) ;
 *   4. crée un établissement et trois comptes de test aux mots de passe
 *      générés, écrits dans `.e2e/accounts.json` (non versionné).
 * Refusé en production. Jamais lancé sur la base de développement `optima`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { encryptSecret } from "../../src/server/auth/crypto";
import { generateTemporaryPassword, hashPassword } from "../../src/server/auth/password";
import { generateTotpSecret } from "../../src/server/auth/totp";
import { withContext } from "../../src/server/db/context";
import {
  E2E_DATABASE,
  E2E_SLUG,
  E2E_STATE_FILE,
  e2eDatabaseUrls,
  type E2eState,
} from "../../tests/e2e/server/env";

const isCi = Boolean(process.env.CI);

function write(state: E2eState): void {
  mkdirSync(path.dirname(E2E_STATE_FILE), { recursive: true });
  writeFileSync(E2E_STATE_FILE, JSON.stringify(state, null, 2));
}

function unavailable(reason: string): never {
  write({ available: false, reason });
  if (isCi) {
    console.error(`Base des tests de bout en bout indisponible : ${reason}`);
    process.exit(1);
  }
  console.warn(
    `Parcours avec la base sautés : ${reason}.\n` +
      "  Créez la base une fois : psql -U postgres -h localhost -f scripts/db/setup-e2e.sql",
  );
  process.exit(0);
}

if (process.env.NODE_ENV === "production") unavailable("refusé en production");
const urls = e2eDatabaseUrls();
if (!urls) unavailable("DATABASE_URL ou MIGRATION_DATABASE_URL manquant");
for (const url of [urls.app, urls.migration]) {
  if (new URL(url).pathname !== `/${E2E_DATABASE}`) {
    unavailable(`la base doit s'appeler ${E2E_DATABASE} (elle est vidée à chaque lancement)`);
  }
}
const key = process.env.AUTH_ENCRYPTION_KEY;
if (!key) unavailable("AUTH_ENCRYPTION_KEY manquant");

// 1. La base répond-elle ?
const probe = new pg.Client({ connectionString: urls.migration });
try {
  await probe.connect();
} catch (error) {
  unavailable(`connexion impossible à ${E2E_DATABASE} (${(error as Error).message})`);
}

// 2. Migrations, avec le rôle des migrations (CLAUDE.md § 3.8).
execFileSync(
  process.execPath,
  [path.join("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
  {
    env: { ...process.env, MIGRATION_DATABASE_URL: urls.migration },
    stdio: ["ignore", "ignore", "inherit"],
  },
);

// 3. Base vidée : les tables en ajout seul refusent DELETE, pas TRUNCATE (propriétaire).
const { rows } = await probe.query<{ tablename: string }>(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
);
if (rows.length > 0) {
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await probe.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
await probe.end();

// 4. Comptes et établissement de test, avec le rôle de l'application (RLS active).
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urls.app }) });
try {
  const account = async (email: string, name: string, isOwner = false) => {
    const password = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        email,
        displayName: name,
        isOwner,
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
      },
    });
    return { user, account: { email, password, name } };
  };

  const owner = await account("proprietaire@e2e.optima.test", "Propriétaire E2E", true);
  const totpSecret = generateTotpSecret();
  await prisma.user.update({
    where: { id: owner.user.id },
    data: { totpSecretEnc: encryptSecret(totpSecret, key), totpEnabledAt: new Date() },
  });
  const manager = await account("gerant@e2e.optima.test", "Gérante E2E");
  const waiter = await account("serveur@e2e.optima.test", "Serveur E2E");

  const establishmentName = "Restaurant E2E";
  const establishment = await prisma.establishment.create({
    data: { slug: E2E_SLUG, name: establishmentName, type: "restaurant", baseCurrency: "CDF" },
  });
  await prisma.membership.createMany({
    data: [
      { userId: manager.user.id, establishmentId: establishment.id, role: "manager" },
      { userId: waiter.user.id, establishmentId: establishment.id, role: "waiter" },
    ],
  });
  await withContext(prisma, { establishmentId: establishment.id, isOwner: false }, async (tx) => {
    await tx.establishmentModule.createMany({
      data: ["catalog", "stock", "sales", "documents", "restaurant", "reports"].map((module) => ({
        establishmentId: establishment.id,
        module,
        enabled: true,
      })),
    });
    const point = (kind: string, name: string, menu: string, sortOrder: number) =>
      tx.servicePoint.create({
        data: { establishmentId: establishment.id, kind, name, menu, sortOrder },
      });
    const counter = await point("counter", "Comptoir", "drinks", 1);
    const kitchen = await point("kitchen", "Cuisine", "food", 2);
    // [TEST] Prix fictifs, propres à la base des tests.
    await tx.menuItem.createMany({
      data: [
        {
          servicePointId: counter.id,
          name: "Primus 72 cl",
          category: "Bières",
          unit: "bottle",
          price: 3500,
        },
        {
          servicePointId: counter.id,
          name: "Eau minérale 50 cl",
          category: "Eaux",
          unit: "bottle",
          price: 1000,
        },
        {
          servicePointId: kitchen.id,
          name: "Tilapia",
          category: "Poissons",
          unit: "dish",
          price: 15000,
        },
        {
          servicePointId: kitchen.id,
          name: "Frites",
          category: "Accompagnements",
          unit: "dish",
          price: 4000,
        },
      ].map(({ price, ...item }) => ({
        ...item,
        establishmentId: establishment.id,
        priceMinor: BigInt(price * 100),
        currency: "CDF",
      })),
    });
    await tx.diningTable.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({
        establishmentId: establishment.id,
        label: `Table ${index + 1}`,
        sortOrder: index + 1,
      })),
    });
  });

  write({
    available: true,
    slug: E2E_SLUG,
    establishmentName,
    owner: { ...owner.account, totpSecret },
    manager: manager.account,
    waiter: waiter.account,
  });
  console.log(`Base ${E2E_DATABASE} prête : migrations appliquées, comptes de test créés.`);
} finally {
  await prisma.$disconnect();
}
