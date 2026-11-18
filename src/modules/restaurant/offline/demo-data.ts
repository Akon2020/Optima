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

import { moneyFromMajor, sumMoney, toMajor, type Currency } from "@/shared/lib/money";

import { businessDayStart } from "../domain/business-day";
import { businessDayKey } from "../domain/business-day";
import { minimumTendered } from "../domain/payment";
import type {
  DiningTable,
  MenuItem,
  OptionGroup,
  PrepStatus,
  SaleUnit,
  ServicePoint,
  StaffMember,
} from "../domain/types";
import type { RestaurantDb } from "./db";
import {
  addExchangeRate,
  cashClosingDraft,
  createCustomer,
  createOrder,
  declareCashClosing,
  assignDelivery,
  createRequisition,
  morningProposals,
  recordPayment,
  recordStockCount,
  releaseTable,
  requestAdjustment,
  saveDeliveryZone,
  saveMorningStock,
  setDeliveryStatus,
  stockCountDraft,
  validateDay,
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

/** Livreur du personnel (D-036) ; zones génériques, frais fixés par le gérant (D-070). */
const DEMO_COURIER: StaffMember = {
  id: "staff-courier-1",
  establishmentId: ESTABLISHMENT_ID,
  name: "Jean L.",
  role: "courier",
};

const DEMO_ZONES: { name: string; feeMajor: number }[] = [
  { name: "Centre", feeMajor: 2000 },
  { name: "Nord", feeMajor: 3000 },
  { name: "Sud", feeMajor: 3000 },
];

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

/**
 * Options et formule de démonstration (D-060), à remplacer par le vrai menu :
 * le tilapia se choisit grillé ou frit, avec des suppléments facultatifs.
 */
const DEMO_OPTIONS: Record<
  string,
  { name: string; isRequired: boolean; isMultiple: boolean; options: [string, number][] }[]
> = {
  tilapia: [
    {
      name: "Préparation",
      isRequired: true,
      isMultiple: false,
      options: [
        ["Grillé", 0],
        ["Frit", 0],
      ],
    },
    {
      name: "Suppléments",
      isRequired: false,
      isMultiple: true,
      options: [
        ["Pili-pili", 0],
        ["Bananes plantains", 2000],
      ],
    },
  ],
};

const DEMO_FORMULA = {
  id: "item-formula-pork",
  point: "sp-kitchen",
  name: "Formule porc",
  category: "Formules",
  description: "Viande de porc, foufou et une Primus.",
  price: 16000,
  components: ["item-pork", "item-foufou", "item-primus"],
};

function demoOptionGroups(key: string, currency: Currency): OptionGroup[] | undefined {
  const groups = DEMO_OPTIONS[key];
  if (!groups) return undefined;
  return groups.map((group, groupIndex) => ({
    id: `opt-${key}-${groupIndex + 1}`,
    name: group.name,
    isRequired: group.isRequired,
    isMultiple: group.isMultiple,
    options: group.options.map(([name, supplement], optionIndex) => ({
      id: `opt-${key}-${groupIndex + 1}-${optionIndex + 1}`,
      name,
      priceDelta: moneyFromMajor(supplement, currency),
    })),
  }));
}

/** Premier choix de chaque groupe obligatoire : les commandes générées restent valides. */
function demoDefaultOptions(key: string): string[] | undefined {
  const groups = DEMO_OPTIONS[key];
  if (!groups) return undefined;
  return groups.flatMap((group, groupIndex) =>
    group.isRequired ? [`opt-${key}-${groupIndex + 1}-1`] : [],
  );
}

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

type SeededOrder = {
  invoiceIds: string[];
  createdAt: number;
  waiter: { id: string; name: string };
};

/** Taux du dollar de la démonstration (D-042), saisi par le gérant le matin. */
const DEMO_RATE = "2850";

async function seedOrders(
  db: RestaurantDb,
  ctx: DeviceContext,
  random: () => number,
  window: { from: number; to: number; count: number },
): Promise<SeededOrder[]> {
  const sellable = ITEMS.filter((item) => item.price !== null && item.weight > 0);
  const created: SeededOrder[] = [];
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
          lines: [...lines].map(([menuItemId, quantity]) => {
            const optionIds = demoDefaultOptions(menuItemId.replace(/^item-/, ""));
            return optionIds ? { menuItemId, quantity, optionIds } : { menuItemId, quantity };
          }),
        },
        { createdAt: createdAt.toISOString(), enqueue: false },
      );
      created.push({
        invoiceIds: invoices.map((i) => i.id),
        createdAt: createdAt.getTime(),
        waiter,
      });
    } catch {
      // Un élément épuisé dans la démo : la commande est simplement ignorée.
    }
  }
  return created;
}

/**
 * La veille, clôturée de bout en bout (EF-CLO-01 à 04) : chaque commande est
 * payée en francs, chaque serveur déclare sa caisse (l'un avec un manquant
 * expliqué), le gérant compte le stock (une casse déclarée) puis valide.
 */
async function seedYesterdayClosing(
  db: RestaurantDb,
  ctx: DeviceContext,
  manager: DeviceContext,
  orders: readonly SeededOrder[],
  yesterdayStart: number,
): Promise<void> {
  const at = (hours: number) => new Date(yesterdayStart + hours * HOUR_MS).toISOString();
  const asWaiter = (waiter: { id: string; name: string }): DeviceContext => ({
    ...ctx,
    userId: waiter.id,
    userName: waiter.name,
    role: "waiter",
  });
  try {
    // D-059 : deux fiches clients fictives ; la dernière commande de la veille
    // part à crédit (validée par le gérant) au lieu d'être payée.
    const rose = await createCustomer(
      db,
      manager,
      { name: "Maman Rose", phone: "+243 990 000 001" },
      { createdAt: at(10), enqueue: false },
    );
    await createCustomer(
      db,
      manager,
      { name: "Papa Jean", phone: "+243 990 000 002" },
      { createdAt: at(10), enqueue: false },
    );
    const credited = orders.at(-1);
    const creditedInvoice = credited
      ? await db.invoices.get(credited.invoiceIds[0] ?? "")
      : undefined;
    if (creditedInvoice) {
      await requestAdjustment(
        db,
        manager,
        {
          kind: "credit",
          orderId: creditedInvoice.orderId,
          reason: "Cliente habituelle, paiera samedi",
          customerId: rose.id,
        },
        { requestedAt: at(16), enqueue: false },
      );
    }
    for (const order of orders) {
      if (order === credited) continue;
      const invoices = (await db.invoices.bulkGet(order.invoiceIds)).filter(
        (invoice) => invoice !== undefined,
      );
      const due = sumMoney(
        invoices.map((invoice) => invoice.total),
        ctx.settings.currency,
      );
      await recordPayment(
        db,
        asWaiter(order.waiter),
        {
          invoiceIds: order.invoiceIds,
          method: "cash",
          provider: null,
          reference: null,
          currency: ctx.settings.currency,
          amountMajor: Math.ceil(toMajor(due) / 5_000) * 5_000,
        },
        { createdAt: new Date(order.createdAt + 50 * 60_000).toISOString(), enqueue: false },
      );
    }
    for (const [index, waiter] of WAITERS.entries()) {
      const draft = await cashClosingDraft(db, asWaiter(waiter), at(17));
      if (draft.lines.length === 0 && draft.unpaidInvoiceIds.length === 0) continue;
      const isShort = index === 0;
      await declareCashClosing(
        db,
        asWaiter(waiter),
        {
          counted: Object.fromEntries(
            draft.lines.map((line) => [
              line.key,
              toMajor(line.expected) - (isShort && line.key.startsWith("cash") ? 2_000 : 0),
            ]),
          ),
          comment: isShort ? "Monnaie rendue en trop à une table" : "",
        },
        { declaredAt: at(17), enqueue: false },
      );
    }
    const day = businessDayKey(at(12), ctx.settings.businessDayStartHour, ctx.settings.timeZone);
    for (const point of SERVICE_POINTS) {
      const lines = await stockCountDraft(db, manager, point.id, day);
      if (lines.length === 0) continue;
      const brokenKey = point.id === "sp-counter" ? "item-primus" : null;
      await recordStockCount(
        db,
        manager,
        {
          servicePointId: point.id,
          lines: lines.map((line) => {
            const expected = Math.max(0, (line.morning ?? 0) - line.sold);
            const isBroken = line.menuItemId === brokenKey && expected >= 1;
            return {
              menuItemId: line.menuItemId,
              counted: isBroken ? expected - 1 : expected,
              declaredOut: isBroken ? 1 : 0,
              outReason: isBroken ? "Casse" : "",
            };
          }),
          comment: "",
        },
        { countedAt: at(17.5), enqueue: false },
      );
    }
    await validateDay(
      db,
      manager,
      { comment: "Journée calme.", isOnline: true, writeLocally: true },
      { validatedAt: at(18) },
    );
  } catch {
    // Démonstration : une clôture incomplète reste simplement à faire.
  }
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
    ...(DEMO_OPTIONS[item.key]
      ? { optionGroups: demoOptionGroups(item.key, ctx.settings.currency) ?? [] }
      : {}),
  }));
  menuItems.push({
    id: DEMO_FORMULA.id,
    establishmentId: ESTABLISHMENT_ID,
    servicePointId: DEMO_FORMULA.point,
    name: DEMO_FORMULA.name,
    description: DEMO_FORMULA.description,
    category: DEMO_FORMULA.category,
    unit: "dish",
    price: moneyFromMajor(DEMO_FORMULA.price, ctx.settings.currency),
    createdAt: CREATED_AT,
    archivedAt: null,
    kind: "formula",
    components: DEMO_FORMULA.components,
  });

  await db.transaction(
    "rw",
    [db.servicePoints, db.menuItems, db.diningTables, db.staff, db.meta],
    async () => {
      await db.servicePoints.bulkPut(SERVICE_POINTS);
      await db.menuItems.bulkPut(menuItems);
      await db.diningTables.bulkPut(TABLES);
      await db.staff.bulkPut([DEMO_MANAGER, ...WAITERS, DEMO_COURIER]);
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
  await seedYesterdayClosing(db, ctx, manager, yesterdayOrders, yesterdayStart.getTime());

  // Aujourd'hui : réquisition du matin du comptoir et de la cuisine (D-069),
  // qui complète le reste de la veille jusqu'au stock habituel, puis stock du
  // matin saisi sur la proposition (deux bouteilles cassées au comptoir).
  const enteredAt = new Date(
    Math.min(dayStart.getTime() + HOUR_MS, now.getTime() - 60_000),
  ).toISOString();
  const requisitionAt = new Date(
    Math.max(dayStart.getTime() + 60_000, new Date(enteredAt).getTime() - 20 * 60_000),
  ).toISOString();
  const leftovers = await morningProposals(db, manager, dayStart.toISOString());
  for (const pointId of ["sp-counter", "sp-kitchen"]) {
    const lines = ITEMS.filter((item) => item.point === pointId && item.price !== null)
      .map((item) => ({
        menuItemId: `item-${item.key}`,
        quantity: Math.max(0, (item.morning ?? 0) - (leftovers.get(`item-${item.key}`) ?? 0)),
      }))
      .filter((line) => line.quantity > 0);
    if (lines.length > 0) {
      await createRequisition(
        db,
        manager,
        { servicePointId: pointId, isReturn: false, lines, comment: "" },
        { createdAt: requisitionAt, enqueue: false },
      );
    }
  }
  const proposals = await morningProposals(db, manager, dayStart.toISOString());
  for (const pointId of ["sp-counter", "sp-kitchen"]) {
    await saveMorningStock(
      db,
      manager,
      {
        servicePointId: pointId,
        lines: ITEMS.filter((item) => item.point === pointId && item.price !== null).map((item) => {
          const proposed = proposals.get(`item-${item.key}`) ?? null;
          const base = proposed ?? item.morning ?? 0;
          const isBroken = item.key === "primus";
          const quantity = isBroken ? Math.max(0, base - 2) : base;
          const reason = proposed !== null && proposed !== quantity ? "2 bouteilles cassées" : "";
          return { menuItemId: `item-${item.key}`, quantity, reason };
        }),
      },
      { enteredAt, enqueue: false },
    );
  }
  // Un complément de Primus en milieu de journée, s'il est déjà passé.
  const complementAt = dayStart.getTime() + 7 * HOUR_MS;
  if (complementAt < now.getTime() - 60_000) {
    await createRequisition(
      db,
      manager,
      {
        servicePointId: "sp-counter",
        isReturn: false,
        lines: [{ menuItemId: "item-primus", quantity: 24 }],
        comment: "Un casier de plus pour le soir",
      },
      { createdAt: new Date(complementAt).toISOString(), enqueue: false },
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

    // Encaissement (D-032, D-033) : les clients partis depuis une heure ont payé,
    // le plus souvent en francs, parfois en dollars ou par M-Pesa.
    await addExchangeRate(db, manager, DEMO_RATE, {
      effectiveAt: new Date(dayStart.getTime() + 2 * HOUR_MS).toISOString(),
      enqueue: false,
    });
    for (const [index, order] of created.entries()) {
      if (now.getTime() - order.createdAt <= 60 * 60_000) continue;
      const invoices = (await db.invoices.bulkGet(order.invoiceIds)).filter(
        (invoice) => invoice !== undefined,
      );
      const due = sumMoney(
        invoices.map((invoice) => invoice.total),
        ctx.settings.currency,
      );
      const kind = index % 5;
      const currency = kind === 4 ? "USD" : ctx.settings.currency;
      const amountMajor =
        kind === 3
          ? toMajor(due)
          : kind === 4
            ? Math.ceil(toMajor(minimumTendered(due, "USD", DEMO_RATE)))
            : Math.ceil(toMajor(due) / 5_000) * 5_000;
      try {
        await recordPayment(
          db,
          { ...ctx, userId: order.waiter.id, userName: order.waiter.name, role: "waiter" },
          {
            invoiceIds: order.invoiceIds,
            method: kind === 3 ? "mobile-money" : "cash",
            provider: kind === 3 ? "mpesa" : null,
            reference: null,
            currency,
            amountMajor,
          },
          { createdAt: new Date(order.createdAt + 55 * 60_000).toISOString(), enqueue: false },
        );
      } catch {
        // Paiement impossible dans la démo : la commande reste à encaisser.
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

    // D-058 : une demande d'annulation d'un serveur attend la décision du gérant.
    const latest = created.at(-1);
    const latestInvoice = latest ? await db.invoices.get(latest.invoiceIds[0] ?? "") : undefined;
    if (latest && latestInvoice) {
      try {
        await requestAdjustment(
          db,
          { ...ctx, userId: latest.waiter.id, userName: latest.waiter.name, role: "waiter" },
          {
            kind: "cancel",
            orderId: latestInvoice.orderId,
            reason: "Le client a changé d'avis avant la préparation",
          },
          { requestedAt: new Date(latest.createdAt + 2 * 60_000).toISOString(), enqueue: false },
        );
      } catch {
        // Commande déjà payée dans la démo : pas de demande.
      }
    }
  }

  await seedDeliveries(db, ctx, manager, now, dayStart);
  await db.meta.put({ key: SEED_FLAG, value: nowIso });
}

/**
 * Livraison (D-070) : trois zones, et une commande en livraison du jour,
 * attribuée au livreur et en route, si la journée est assez avancée.
 */
async function seedDeliveries(
  db: RestaurantDb,
  ctx: DeviceContext,
  manager: DeviceContext,
  now: Date,
  dayStart: Date,
): Promise<void> {
  const at = new Date(dayStart.getTime() + 60_000).toISOString();
  const zones = [];
  for (const zone of DEMO_ZONES) {
    zones.push(await saveDeliveryZone(db, manager, zone, { at, enqueue: false }));
  }
  // Vers midi, ou une demi-heure avant maintenant en début de journée.
  const orderAt = Math.min(dayStart.getTime() + 6 * HOUR_MS, now.getTime() - 30 * 60_000);
  const zone = zones[0];
  if (!zone || orderAt < dayStart.getTime() + HOUR_MS) return;
  const waiter = WAITERS[1] ?? WAITERS[0];
  if (!waiter) return;
  try {
    const { order } = await createOrder(
      db,
      { ...ctx, userId: waiter.id, userName: waiter.name, role: "waiter" },
      {
        mode: "delivery",
        tableId: null,
        lines: [
          { menuItemId: "item-fanta", quantity: 2 },
          { menuItemId: "item-coca", quantity: 1 },
        ],
        delivery: {
          customerName: "Client démo",
          phone: "+243 990 000 000",
          address: "Avenue de démonstration, n° 1",
          zoneId: zone.id,
          desiredTime: "",
        },
      },
      { createdAt: new Date(orderAt).toISOString(), enqueue: false },
    );
    const delivery = await db.deliveries.where("orderId").equals(order.id).first();
    if (!delivery) return;
    await assignDelivery(db, manager, delivery.id, DEMO_COURIER.id, {
      at: new Date(orderAt + 5 * 60_000).toISOString(),
      enqueue: false,
    });
    await setDeliveryStatus(
      db,
      { ...ctx, userId: DEMO_COURIER.id, userName: DEMO_COURIER.name, role: "courier" },
      delivery.id,
      "en-route",
      null,
      { at: new Date(orderAt + 15 * 60_000).toISOString(), enqueue: false },
    );
  } catch {
    // Élément épuisé ou absent dans la démo : pas de livraison d'exemple.
  }
}
