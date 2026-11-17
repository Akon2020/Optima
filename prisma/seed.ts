/**
 * Données de développement (CLAUDE.md § 8, règle 9) : JAMAIS en production.
 *
 * Crée un propriétaire, un établissement restaurant de développement, son
 * personnel, ses points de service, ses tables et son menu. Les mots de passe
 * sont générés et affichés UNE seule fois dans la console : ils sont
 * provisoires (changement obligatoire à la première connexion).
 *
 * Lancement : pnpm db:seed (après pnpm db:migrate).
 */
import { existsSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { generateTemporaryPassword, hashPassword } from "../src/server/auth/password";
import { withContext } from "../src/server/db/context";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (process.env.NODE_ENV === "production") {
  console.error("Refusé : les données de développement ne vont jamais en production.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manque dans .env.local (voir guides/guide.md).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL ?? "proprietaire@optima.local").toLowerCase();
const SLUG = "restaurant-dev";

// [DÉMO] Prix fictifs, identiques à l'aperçu local (src/modules/restaurant/offline/demo-data.ts).
const MENU: {
  point: "counter" | "kitchen" | "grill";
  name: string;
  category: string;
  unit: string;
  price: number | null;
}[] = [
  { point: "counter", name: "Primus 72 cl", category: "Bières", unit: "bottle", price: 3500 },
  { point: "counter", name: "Mützig 65 cl", category: "Bières", unit: "bottle", price: 3500 },
  { point: "counter", name: "Coca-Cola 33 cl", category: "Sucrés", unit: "bottle", price: 1500 },
  { point: "counter", name: "Eau minérale 50 cl", category: "Eaux", unit: "bottle", price: 1000 },
  { point: "kitchen", name: "Viande de porc", category: "Viandes", unit: "dish", price: 12000 },
  { point: "kitchen", name: "Poisson salé", category: "Poissons", unit: "dish", price: 10000 },
  { point: "kitchen", name: "Tilapia", category: "Poissons", unit: "dish", price: 15000 },
  { point: "kitchen", name: "Zingaro", category: "Poissons", unit: "dish", price: 12000 },
  { point: "kitchen", name: "Sambaza", category: "Poissons", unit: "dish", price: 8000 },
  { point: "kitchen", name: "Frites", category: "Accompagnements", unit: "dish", price: 4000 },
  { point: "kitchen", name: "Bisamunyu", category: "Accompagnements", unit: "dish", price: 3000 },
  { point: "kitchen", name: "Birayi", category: "Accompagnements", unit: "dish", price: 3000 },
  { point: "kitchen", name: "Foufou", category: "Accompagnements", unit: "dish", price: 2000 },
  { point: "grill", name: "Viande de chèvre", category: "Grillades", unit: "piece", price: 2500 },
];

async function main() {
  if (await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })) {
    console.log(
      `Rien à faire : ${OWNER_EMAIL} existe déjà. Les données de développement sont en place.`,
    );
    return;
  }

  const credentials: { role: string; identifier: string; password: string }[] = [];
  async function user(email: string, displayName: string, isOwner = false) {
    const password = generateTemporaryPassword();
    credentials.push({ role: isOwner ? "Propriétaire" : displayName, identifier: email, password });
    return prisma.user.create({
      data: {
        email,
        displayName,
        isOwner,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });
  }

  await user(OWNER_EMAIL, "Propriétaire", true);
  const establishment = await prisma.establishment.create({
    data: {
      slug: SLUG,
      name: "Restaurant (développement)",
      type: "restaurant",
      baseCurrency: "CDF",
    },
  });
  const manager = await user("gerant@optima.local", "Gérant");
  const waiter = await user("serveur@optima.local", "Serveur");
  await prisma.membership.createMany({
    data: [
      { userId: manager.id, establishmentId: establishment.id, role: "manager" },
      { userId: waiter.id, establishmentId: establishment.id, role: "waiter" },
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
    const points = {
      counter: await tx.servicePoint.create({
        data: {
          establishmentId: establishment.id,
          kind: "counter",
          name: "Comptoir",
          menu: "drinks",
          sortOrder: 1,
        },
      }),
      kitchen: await tx.servicePoint.create({
        data: {
          establishmentId: establishment.id,
          kind: "kitchen",
          name: "Cuisine",
          menu: "food",
          sortOrder: 2,
        },
      }),
      grill: await tx.servicePoint.create({
        data: {
          establishmentId: establishment.id,
          kind: "grill",
          name: "Grillade",
          menu: "food",
          sortOrder: 3,
        },
      }),
    };
    await tx.menuItem.createMany({
      data: MENU.map((item) => ({
        establishmentId: establishment.id,
        servicePointId: points[item.point].id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        priceMinor: item.price === null ? null : BigInt(item.price * 100),
        currency: "CDF",
      })),
    });
    await tx.diningTable.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        establishmentId: establishment.id,
        label: `Table ${index + 1}`,
        sortOrder: index + 1,
      })),
    });
  });

  console.log(
    "\nDonnées de développement créées. Mots de passe PROVISOIRES (affichés une seule fois) :\n",
  );
  console.table(credentials);
  console.log(
    "Changement obligatoire à la première connexion ; double authentification pour le propriétaire.\n",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
