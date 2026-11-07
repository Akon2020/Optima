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

import { businessDayStart } from "../domain/business-day";
import type {
  DiningTable,
  MenuItem,
  PrepStatus,
  SaleUnit,
  ServicePoint,
  StaffMember,
} from "../domain/types";
import type { RestaurantDb } from "./db";
import {
  createOrder,
  morningProposals,
  releaseTable,
  saveMorningStock,
  type DeviceContext,
} from "./repository";

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

  // Stock du matin de la grillade saisi la veille, pas encore aujourd'hui : alerte EF-TDB-04.
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
  createdAt: CREATED_AT,
  archivedAt: null,
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

const seeding = new WeakMap<RestaurantDb, Promise<void>>();

/**
 * Remplit la base locale avec les données de démonstration si elle est vide.
 * Un seul remplissage à la fois par base (le double montage de React en
 * développement appelle cette fonction deux fois).
 */
export function ensureDemoData(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  let pending = seeding.get(db);
  if (!pending) {
    pending = (async () => {
      if (await db.meta.get(SEED_FLAG)) return;
      await seedDemo(db, ctx);
    })().finally(() => seeding.delete(db));
    seeding.set(db, pending);
  }
  return pending;
}

/** Efface la base locale de démonstration et la remplit à nouveau. */
export async function resetDemoData(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  await seedDemo(db, ctx);
}

const HOUR_MS = 3_600_000;

/** Quantité de la veille pour les éléments sans stock du matin du jour (grillade). */
const YESTERDAY_FALLBACK = 40;

async function seedOrders(
  db: RestaurantDb,
  ctx: DeviceContext,
  random: () => number,
  window: { from: number; to: number; count: number },
): Promise<{ invoiceIds: string[]; createdAt: number }[]> {
  const sellable = ITEMS.filter((item) => item.price !== null && item.weight > 0);
  const created: { invoiceIds: string[]; createdAt: number }[] = [];
  const span = window.to - window.from;

  for (let index = 0; index < window.count; index += 1) {
    const createdAt = new Date(
      window.from + Math.round(((index + random() * 0.8) / window.count) * span),
    );
    const waiter = WAITERS[Math.floor(random() * WAITERS.length)] ?? WAITERS[0];
    if (!waiter) break;
    const isTakeaway = random() < 0.15;
    const lines = new Map<string, number>();
    const lineCount = 1 + Math.floor(random() * 4);
    for (let l = 0; l < lineCount; l += 1) {
      // Une commande sur trois passe aussi par la grillade, pour que la démo
      // montre les trois factures d'avance.
      const item =
        l === 0 && index % 3 === 1
          ? (sellable.find((entry) => entry.point === "sp-grill") ?? pickWeighted(sellable, random))
          : pickWeighted(sellable, random);
      lines.set(
        `item-${item.key}`,
        (lines.get(`item-${item.key}`) ?? 0) + 1 + Math.floor(random() * 2),
      );
    }
    try {
      const { invoices } = await createOrder(
        db,
        { ...ctx, userId: waiter.id, userName: waiter.name, role: "waiter" },
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
  return created;
}

async function seedDemo(db: RestaurantDb, ctx: DeviceContext): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { businessDayStartHour, timeZone } = ctx.settings;
  const dayStart = new Date(businessDayStart(nowIso, businessDayStartHour, timeZone));
  const yesterdayStart = new Date(dayStart.getTime() - 24 * HOUR_MS);
  const manager = {
    ...ctx,
    userId: DEMO_MANAGER.id,
    userName: DEMO_MANAGER.name,
    role: "manager" as const,
  };
  const random = createRandom(20261107);

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

  await db.transaction(
    "rw",
    [db.servicePoints, db.menuItems, db.diningTables, db.staff, db.meta],
    async () => {
      await db.servicePoints.bulkPut(SERVICE_POINTS);
      await db.menuItems.bulkPut(menuItems);
      await db.diningTables.bulkPut(TABLES);
      await db.staff.bulkPut([DEMO_MANAGER, ...WAITERS]);
    },
  );

  // La veille : stock du matin des trois postes, puis une journée de ventes servies.
  for (const point of SERVICE_POINTS) {
    await saveMorningStock(
      db,
      manager,
      {
        servicePointId: point.id,
        lines: ITEMS.filter((item) => item.point === point.id && item.price !== null).map(
          (item) => ({
            menuItemId: `item-${item.key}`,
            quantity: item.morning ?? YESTERDAY_FALLBACK,
            reason: "",
          }),
        ),
      },
      { enteredAt: new Date(yesterdayStart.getTime() + HOUR_MS).toISOString(), enqueue: false },
    );
  }
  const yesterdayOrders = await seedOrders(db, ctx, random, {
    from: yesterdayStart.getTime() + 4 * HOUR_MS,
    to: yesterdayStart.getTime() + 16 * HOUR_MS,
    count: 18,
  });
  for (const order of yesterdayOrders) {
    await db.invoices.bulkUpdate(
      order.invoiceIds.map((key) => ({ key, changes: { prepStatus: "served" as PrepStatus } })),
    );
  }

  // Aujourd'hui : comptoir et cuisine saisis ; les apports du jour sont des
  // écarts justifiés (HYPOTHÈSE D-Q14 : pas encore de réquisitions).
  const enteredAt = new Date(
    Math.min(dayStart.getTime() + HOUR_MS, now.getTime() - 60_000),
  ).toISOString();
  const proposals = await morningProposals(db, manager, dayStart.toISOString());
  for (const pointId of ["sp-counter", "sp-kitchen"]) {
    await saveMorningStock(
      db,
      manager,
      {
        servicePointId: pointId,
        lines: ITEMS.filter((item) => item.point === pointId && item.price !== null).map((item) => {
          const proposed = proposals.get(`item-${item.key}`) ?? null;
          const base = Math.max(item.morning ?? 0, proposed ?? 0);
          const isBroken = item.key === "primus";
          const quantity = isBroken ? base - 2 : base;
          const restocked = proposed !== null && base > proposed;
          const reason =
            proposed === null || proposed === quantity
              ? ""
              : [restocked ? "Réquisition du jour" : "", isBroken ? "2 bouteilles cassées" : ""]
                  .filter(Boolean)
                  .join(" ; ");
          return { menuItemId: `item-${item.key}`, quantity, reason };
        }),
      },
      { enteredAt, enqueue: false },
    );
  }

  // Commandes du jour, entre l'ouverture (début de journée + 4 h) et maintenant.
  const firstOrder = dayStart.getTime() + 4 * HOUR_MS;
  const lastOrder = now.getTime() - 5 * 60_000;
  if (lastOrder > firstOrder) {
    const count = Math.min(26, Math.max(4, Math.round((lastOrder - firstOrder) / (25 * 60_000))));
    const created = await seedOrders(db, ctx, random, { from: firstOrder, to: lastOrder, count });
    // Les clients repartent environ une heure après leur dernière commande :
    // la table est libérée entre deux occupations éloignées, et en fin de repas.
    const timesByTable = new Map<string, number[]>();
    for (const order of await db.orders
      .where("createdAt")
      .aboveOrEqual(dayStart.toISOString())
      .toArray()) {
      if (order.tableId === null) continue;
      timesByTable.set(order.tableId, [
        ...(timesByTable.get(order.tableId) ?? []),
        new Date(order.createdAt).getTime(),
      ]);
    }
    for (const [tableId, times] of timesByTable) {
      const sorted = [...times].sort((a, b) => a - b);
      const releases = sorted.filter((time, index) => {
        const next = sorted[index + 1] ?? now.getTime();
        return next - time > 90 * 60_000;
      });
      for (const time of releases) {
        await releaseTable(db, manager, tableId, {
          releasedAt: new Date(time + 70 * 60_000).toISOString(),
          enqueue: false,
        });
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
