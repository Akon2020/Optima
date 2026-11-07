/**
 * DONNÉES DE DÉMONSTRATION [À COMPLÉTER]
 *
 * Tout ce fichier est provisoire (CLAUDE.md § 8, règle 7) : les prix, les
 * prénoms, les tables et les quantités sont fictifs et servent uniquement à
 * présenter l'interface. Ils sont enregistrés dans le navigateur, jamais sur
 * un serveur, et l'interface affiche en permanence « Données de démonstration ».
 *
 * Seuls les points de service et la liste des plats de la cuisine et de la
 * grillade viennent de l'équipe du restaurant (D-007).
 */

import { moneyFromMajor } from "@/shared/lib/money";

import { businessDayKey, businessDayStart } from "../domain/business-day";
import type {
  DiningTable,
  MenuItem,
  MorningStock,
  PrepStatus,
  SaleUnit,
  ServicePoint,
  StaffMember,
} from "../domain/types";
import type { RestaurantDb } from "./db";
import { createOrder, type DeviceContext } from "./repository";

export const DEMO_ESTABLISHMENT_SLUG = "demo";
export const DEMO_ESTABLISHMENT_NAME = "Restaurant de démonstration";

const ESTABLISHMENT_ID = "demo";
const CREATED_AT = "2026-11-01T06:00:00.000Z";

export const DEMO_MANAGER: StaffMember = {
  id: "staff-manager",
  establishmentId: ESTABLISHMENT_ID,
  name: "Gérant démo",
  role: "manager",
};

const WAITERS: StaffMember[] = ["Amani K.", "Neema B.", "Baraka M.", "Furaha C."].map(
  (name, index) => ({
    id: `staff-waiter-${index + 1}`,
    establishmentId: ESTABLISHMENT_ID,
    name,
    role: "waiter",
  }),
);

const SERVICE_POINTS: ServicePoint[] = [
  {
    id: "sp-counter",
    establishmentId: ESTABLISHMENT_ID,
    kind: "counter",
    name: "Comptoir",
    menu: "drinks",
    sortOrder: 1,
  },
  {
    id: "sp-kitchen",
    establishmentId: ESTABLISHMENT_ID,
    kind: "kitchen",
    name: "Cuisine",
    menu: "food",
    sortOrder: 2,
  },
  {
    id: "sp-grill",
    establishmentId: ESTABLISHMENT_ID,
    kind: "grill",
    name: "Grillade",
    menu: "food",
    sortOrder: 3,
  },
];

type DemoItem = {
  key: string;
  point: string;
  name: string;
  category: string;
  description: string;
  unit: SaleUnit;
  price: number | null;
  morning: number | null;
  weight: number;
};

const ITEMS: DemoItem[] = [
  {
    key: "primus",
    point: "sp-counter",
    name: "Primus 72 cl",
    category: "Bières",
    description: "Bière blonde, grande bouteille.",
    unit: "bottle",
    price: 3500,
    morning: 96,
    weight: 9,
  },
  {
    key: "mutzig",
    point: "sp-counter",
    name: "Mützig 65 cl",
    category: "Bières",
    description: "Bière blonde, grande bouteille.",
    unit: "bottle",
    price: 3500,
    morning: 72,
    weight: 7,
  },
  {
    key: "turbo",
    point: "sp-counter",
    name: "Turbo King 65 cl",
    category: "Bières",
    description: "Bière brune, grande bouteille.",
    unit: "bottle",
    price: 3500,
    morning: 48,
    weight: 5,
  },
  {
    key: "heineken",
    point: "sp-counter",
    name: "Heineken 33 cl",
    category: "Bières",
    description: "Bière blonde, petite bouteille.",
    unit: "bottle",
    price: 4000,
    morning: 24,
    weight: 2,
  },
  {
    key: "coca",
    point: "sp-counter",
    name: "Coca-Cola 33 cl",
    category: "Sucrés",
    description: "Boisson gazeuse, bouteille en verre.",
    unit: "bottle",
    price: 1500,
    morning: 48,
    weight: 6,
  },
  {
    key: "fanta",
    point: "sp-counter",
    name: "Fanta orange 33 cl",
    category: "Sucrés",
    description: "Boisson gazeuse, bouteille en verre.",
    unit: "bottle",
    price: 1500,
    morning: 36,
    weight: 4,
  },
  {
    key: "sprite",
    point: "sp-counter",
    name: "Sprite 33 cl",
    category: "Sucrés",
    description: "Boisson gazeuse, bouteille en verre.",
    unit: "bottle",
    price: 1500,
    morning: 9,
    weight: 3,
  },
  {
    key: "water",
    point: "sp-counter",
    name: "Eau minérale 50 cl",
    category: "Eaux",
    description: "Eau plate.",
    unit: "bottle",
    price: 1000,
    morning: 60,
    weight: 5,
  },
  {
    key: "wine",
    point: "sp-counter",
    name: "Vin rouge",
    category: "Vins",
    description: "Bouteille de 75 cl.",
    unit: "bottle",
    price: null,
    morning: null,
    weight: 0,
  },

  {
    key: "pork",
    point: "sp-kitchen",
    name: "Viande de porc",
    category: "Viandes",
    description: "Porc en sauce ou frit.",
    unit: "dish",
    price: 12000,
    morning: 25,
    weight: 6,
  },
  {
    key: "salted-fish",
    point: "sp-kitchen",
    name: "Poisson salé",
    category: "Poissons",
    description: "Poisson salé en sauce.",
    unit: "dish",
    price: 10000,
    morning: 15,
    weight: 3,
  },
  {
    key: "tilapia",
    point: "sp-kitchen",
    name: "Tilapia",
    category: "Poissons",
    description: "Tilapia entier.",
    unit: "dish",
    price: 15000,
    morning: 18,
    weight: 5,
  },
  {
    key: "zingaro",
    point: "sp-kitchen",
    name: "Zingaro",
    category: "Poissons",
    description: "Poisson, portion.",
    unit: "dish",
    price: 12000,
    morning: 4,
    weight: 2,
  },
  {
    key: "sambaza",
    point: "sp-kitchen",
    name: "Sambaza",
    category: "Poissons",
    description: "Petits poissons du lac Kivu.",
    unit: "dish",
    price: 8000,
    morning: 20,
    weight: 4,
  },
  {
    key: "fries",
    point: "sp-kitchen",
    name: "Frites",
    category: "Accompagnements",
    description: "Portion de frites.",
    unit: "dish",
    price: 4000,
    morning: 40,
    weight: 7,
  },
  {
    key: "beans",
    point: "sp-kitchen",
    name: "Bisamunyu",
    category: "Accompagnements",
    description: "Haricots.",
    unit: "dish",
    price: 3000,
    morning: 30,
    weight: 3,
  },
  {
    key: "potatoes",
    point: "sp-kitchen",
    name: "Birayi",
    category: "Accompagnements",
    description: "Pommes de terre.",
    unit: "dish",
    price: 3000,
    morning: 30,
    weight: 3,
  },
  {
    key: "foufou",
    point: "sp-kitchen",
    name: "Foufou",
    category: "Accompagnements",
    description: "Boule de foufou.",
    unit: "dish",
    price: 2000,
    morning: 40,
    weight: 5,
  },

  // Stock du matin de la grillade volontairement non saisi : alerte EF-TDB-04.
  {
    key: "goat",
    point: "sp-grill",
    name: "Viande de chèvre",
    category: "Grillades",
    description: "Chèvre grillée, vendue au morceau.",
    unit: "piece",
    price: 2500,
    morning: null,
    weight: 8,
  },
];

const TABLES: DiningTable[] = Array.from({ length: 12 }, (_, index) => ({
  id: `table-${index + 1}`,
  establishmentId: ESTABLISHMENT_ID,
  label: `Table ${index + 1}`,
  sortOrder: index + 1,
}));

/** Générateur pseudo-aléatoire déterministe (mulberry32) : la démo est reproductible. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random() * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item;
  }
  return items[items.length - 1] as T;
}

const SEED_FLAG = "demo-seeded-at";

/** Remplit la base locale avec les données de démonstration si elle est vide. */
export async function ensureDemoData(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  if (await db.meta.get(SEED_FLAG)) return;
  await seedDemo(db, ctx);
}

/** Efface la base locale de démonstration et la remplit à nouveau. */
export async function resetDemoData(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  await seedDemo(db, ctx);
}

async function seedDemo(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { businessDayStartHour, timeZone } = ctx.settings;
  const day = businessDayKey(nowIso, businessDayStartHour, timeZone);
  const dayStart = new Date(businessDayStart(nowIso, businessDayStartHour, timeZone));

  const menuItems: MenuItem[] = ITEMS.map((item) => ({
    id: `item-${item.key}`,
    establishmentId: ESTABLISHMENT_ID,
    servicePointId: item.point,
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    price: item.price === null ? null : moneyFromMajor(item.price, ctx.settings.currency),
    createdAt: CREATED_AT,
    archivedAt: null,
  }));

  const morningStock: MorningStock[] = ITEMS.filter((item) => item.morning !== null).map(
    (item) => ({
      id: `${day}:item-${item.key}`,
      establishmentId: ESTABLISHMENT_ID,
      menuItemId: `item-${item.key}`,
      day,
      quantity: item.morning ?? 0,
      enteredAt: new Date(dayStart.getTime() + 60 * 60_000).toISOString(),
      enteredBy: DEMO_MANAGER.id,
    }),
  );

  await db.transaction(
    "rw",
    [db.servicePoints, db.menuItems, db.diningTables, db.staff, db.morningStock, db.meta],
    async () => {
      await db.servicePoints.bulkPut(SERVICE_POINTS);
      await db.menuItems.bulkPut(menuItems);
      await db.diningTables.bulkPut(TABLES);
      await db.staff.bulkPut([DEMO_MANAGER, ...WAITERS]);
      await db.morningStock.bulkPut(morningStock);
    },
  );

  // Commandes réparties entre l'ouverture (début de journée + 4 h) et maintenant.
  const random = createRandom(20261107);
  const firstOrder = dayStart.getTime() + 4 * 3_600_000;
  const span = now.getTime() - firstOrder - 5 * 60_000;
  if (span > 0) {
    const count = Math.min(26, Math.max(4, Math.round(span / (25 * 60_000))));
    const sellable = ITEMS.filter((item) => item.price !== null && item.weight > 0);
    const created: { invoiceIds: string[]; createdAt: number }[] = [];

    for (let index = 0; index < count; index += 1) {
      const createdAt = new Date(
        firstOrder + Math.round(((index + random() * 0.8) / count) * span),
      );
      const waiter = WAITERS[Math.floor(random() * WAITERS.length)] ?? WAITERS[0];
      if (!waiter) break;
      const isTakeaway = random() < 0.15;
      const lines = new Map<string, number>();
      const lineCount = 1 + Math.floor(random() * 4);
      for (let l = 0; l < lineCount; l += 1) {
        const item = pickWeighted(sellable, random);
        lines.set(
          `item-${item.key}`,
          (lines.get(`item-${item.key}`) ?? 0) + 1 + Math.floor(random() * 2),
        );
      }
      try {
        const { invoices } = await createOrder(
          db,
          { ...ctx, userId: waiter.id, userName: waiter.name },
          {
            mode: isTakeaway ? "takeaway" : "dine-in",
            tableId: isTakeaway ? null : (TABLES[Math.floor(random() * TABLES.length)]?.id ?? null),
            lines: [...lines].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
          },
          { createdAt: createdAt.toISOString(), enqueue: false },
        );
        created.push({ invoiceIds: invoices.map((i) => i.id), createdAt: createdAt.getTime() });
      } catch {
        // Un élément épuisé dans la démo : la commande est simplement ignorée.
      }
    }

    // Avancement de la préparation : les commandes anciennes sont servies.
    for (const order of created) {
      const ageMinutes = (now.getTime() - order.createdAt) / 60_000;
      const status: PrepStatus = ageMinutes > 45 ? "served" : ageMinutes > 15 ? "ready" : "pending";
      if (status !== "pending") {
        await db.invoices.bulkUpdate(
          order.invoiceIds.map((key) => ({ key, changes: { prepStatus: status } })),
        );
      }
    }
  }

  await db.meta.put({ key: SEED_FLAG, value: nowIso });
}
