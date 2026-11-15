import type { z } from "zod";

import { localYear } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { uuidv7 } from "@/shared/lib/ids";
import { addMoney, moneyFromMajor, zero as zeroMoney, type Money } from "@/shared/lib/money";
import { createOperation } from "@/offline/outbox";

import {
  MIN_REASON_LENGTH as MIN_ADJUSTMENT_REASON,
  adjustmentIssue,
  pendingRequests,
  splitDiscount,
} from "../domain/adjustment";
import {
  businessDayKey,
  businessDayStart,
  businessDayStartOf,
  currentDayKey,
} from "../domain/business-day";
import {
  collectedByServicePoint,
  collectorsWithUnclosedPayments,
  dayClosingIssues,
  expectedCashLines,
  latestStockCounts,
  unclosedPayments,
  unpaidInvoiceIds,
  validateCashClosing,
  validateStockCount,
} from "../domain/closing";
import { computeAvailability, maxOrderableQuantity } from "../domain/menu";
import { counterKey, formatDocumentNumber, type DocumentPrefix } from "../domain/numbering";
import { linesTotal, splitOrderByServicePoint } from "../domain/order";
import {
  allocatePayment,
  invoiceBalances,
  parseRate,
  remainingDue,
  settlePayment,
} from "../domain/payment";
import {
  currentEntries,
  isMorningStockComplete,
  itemsRequiringMorningStock,
  proposeMorningQuantity,
  validateMorningLines,
} from "../domain/morning-stock";
import type {
  AdjustmentDecision,
  AdjustmentKind,
  AdjustmentRequest,
  AdvanceInvoice,
  CashClosing,
  CashClosingLine,
  MenuItem,
  DiningTable,
  ExchangeRate,
  MorningStockEntry,
  Order,
  OrderLine,
  Payment,
  PaymentAllocation,
  PrepStatus,
  ServicePoint,
  StockCount,
  StockCountLine,
  TableRelease,
} from "../domain/types";
import { nextTableLabel, validateTableLabel } from "../domain/tables";
import { menuItemInputSchema, type MenuItemInput } from "../schemas/menu-item";
import { orderInputSchema, type OrderInput } from "../schemas/order";
import { paymentInputSchema, type PaymentInput } from "../schemas/payment";
import type {
  adjustmentDecidedSchema,
  adjustmentRequestedSchema,
  cashClosingDeclaredSchema,
  dayValidatedSchema,
  orderCreatedSchema,
  paymentRecordedSchema,
  stockCountedSchema,
} from "../schemas/sync";

type OrderCreatedPayload = z.infer<typeof orderCreatedSchema>;
type PaymentRecordedPayload = z.infer<typeof paymentRecordedSchema>;
type CashClosingDeclaredPayload = z.infer<typeof cashClosingDeclaredSchema>;
type StockCountedPayload = z.infer<typeof stockCountedSchema>;
type DayValidatedPayload = z.infer<typeof dayValidatedSchema>;
type AdjustmentRequestedPayload = z.infer<typeof adjustmentRequestedSchema>;
type AdjustmentDecidedPayload = z.infer<typeof adjustmentDecidedSchema>;
import { hasPermission, type RestaurantPermission, type RestaurantRole } from "../permissions";
import type { RestaurantSettings } from "../settings";
import type { RestaurantDb } from "./db";

/** Contexte de l'appareil et de l'utilisateur actif. */
export type DeviceContext = {
  establishmentId: string;
  userId: string;
  userName: string;
  deviceId: string;
  /** Code appareil (D01, D02...) utilisé dans la numérotation (EF-DOC-01). */
  deviceCode: string;
  role: RestaurantRole;
  settings: RestaurantSettings;
};

function assertPermission(ctx: DeviceContext, permission: RestaurantPermission, action: string) {
  if (!hasPermission(ctx.role, permission)) {
    throw new DomainError(
      "FORBIDDEN",
      `Votre rôle ne permet pas de ${action}. Demandez au gérant.`,
    );
  }
}

async function nextNumber(
  db: RestaurantDb,
  prefix: DocumentPrefix,
  createdAt: string,
  ctx: DeviceContext,
): Promise<string> {
  const year = localYear(createdAt, ctx.settings.timeZone);
  const key = counterKey(prefix, year, ctx.deviceCode);
  const current = (await db.counters.get(key))?.value ?? 0;
  const sequence = current + 1;
  await db.counters.put({ key, value: sequence });
  return formatDocumentNumber({ prefix, year, deviceCode: ctx.deviceCode, sequence });
}

/** Quantités vendues par élément sur une période [depuis, jusqu'à[ (factures non annulées). */
export async function soldQuantitiesBetween(
  db: RestaurantDb,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  const invoices = await db.invoices
    .where("createdAt")
    .between(fromIso, toIso, true, false)
    .toArray();
  const sold = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.paymentStatus === "cancelled") continue;
    for (const line of invoice.lines) {
      sold.set(line.menuItemId, (sold.get(line.menuItemId) ?? 0) + line.quantity);
    }
  }
  return sold;
}

/** Saisies du stock du matin en vigueur pour une journée, par élément. */
export async function currentMorningStock(
  db: RestaurantDb,
  day: string,
): Promise<Map<string, MorningStockEntry>> {
  return currentEntries(await db.morningStockEntries.where("day").equals(day).toArray());
}

const DAY_MS = 24 * 3_600_000;

function nextDayIso(dayStartIso: string): string {
  return new Date(new Date(dayStartIso).getTime() + DAY_MS).toISOString();
}

/**
 * Enregistre une commande (EF-CMD-01 à 03, RG-CMD-01) : relit les prix depuis
 * le menu, contrôle la disponibilité, répartit par point de service, numérote
 * la commande et ses factures d'avance, puis place l'opération dans la file.
 */
export async function createOrder(
  db: RestaurantDb,
  ctx: DeviceContext,
  rawInput: OrderInput,
  options: { createdAt?: string; enqueue?: boolean } = {},
): Promise<{ order: Order; invoices: AdvanceInvoice[] }> {
  assertPermission(ctx, "restaurant.order.create", "prendre une commande");
  const parsed = orderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      "INVALID_ORDER",
      parsed.error.issues[0]?.message ?? "La commande n'est pas valide.",
    );
  }
  const input = parsed.data;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const { currency, timeZone, businessDayStartHour, lowStockThreshold } = ctx.settings;

  return db.transaction(
    "rw",
    [
      db.menuItems,
      db.servicePoints,
      db.diningTables,
      db.orders,
      db.invoices,
      db.counters,
      db.morningStockEntries,
      db.outbox,
    ],
    async () => {
      const servicePoints = await db.servicePoints.toArray();
      const items = await db.menuItems.bulkGet(input.lines.map((line) => line.menuItemId));
      const dayStart = businessDayStart(createdAt, businessDayStartHour, timeZone);
      const day = businessDayKey(createdAt, businessDayStartHour, timeZone);
      const sold = await soldQuantitiesBetween(db, dayStart, nextDayIso(dayStart));
      const morningStock = await currentMorningStock(db, day);

      const lines: OrderLine[] = [];
      for (const [index, requested] of input.lines.entries()) {
        const item: MenuItem | undefined = items[index];
        if (!item || item.archivedAt !== null) {
          throw new DomainError(
            "ITEM_NOT_FOUND",
            "Un élément de la commande n'existe plus au menu.",
          );
        }
        if (item.price === null) {
          throw new DomainError(
            "PRICE_NOT_SET",
            `« ${item.name} » n'a pas de prix : demandez au gérant de le fixer.`,
          );
        }
        const morning = morningStock.get(item.id);
        const availability = computeAvailability(
          item,
          morning?.quantity ?? null,
          sold.get(item.id) ?? 0,
          lowStockThreshold,
        );
        const max = maxOrderableQuantity(availability);
        if (max !== null && requested.quantity > max) {
          throw new DomainError(
            "ITEM_SOLD_OUT",
            max <= 0
              ? `« ${item.name} » est épuisé.`
              : `Il ne reste que ${max} « ${item.name} » aujourd'hui.`,
          );
        }
        lines.push({
          menuItemId: item.id,
          name: item.name,
          servicePointId: item.servicePointId,
          unit: item.unit,
          unitPrice: item.price,
          quantity: requested.quantity,
        });
      }

      const table = input.tableId ? await db.diningTables.get(input.tableId) : undefined;
      if (table && table.archivedAt !== null) {
        throw new DomainError("TABLE_ARCHIVED", `« ${table.label} » n'est plus en service.`);
      }
      if (input.tableId && !table) {
        throw new DomainError(
          "TABLE_NOT_FOUND",
          "Cette table n'existe plus. Choisissez-en une autre.",
        );
      }
      const tableLabel = table?.label ?? null;

      const split = splitOrderByServicePoint(lines, servicePoints, currency);
      const orderId = uuidv7(new Date(createdAt).getTime());
      const orderNumber = await nextNumber(db, "CMD", createdAt, ctx);

      const invoices: AdvanceInvoice[] = [];
      for (const group of split) {
        invoices.push({
          id: uuidv7(new Date(createdAt).getTime()),
          establishmentId: ctx.establishmentId,
          orderId,
          servicePointId: group.servicePointId,
          number: await nextNumber(db, "FAC", createdAt, ctx),
          mode: input.mode,
          tableLabel,
          waiterId: ctx.userId,
          waiterName: ctx.userName,
          deviceCode: ctx.deviceCode,
          createdAt,
          lines: group.lines,
          total: group.total,
          prepStatus: "pending",
          paymentStatus: "unpaid",
        });
      }

      const order: Order = {
        id: orderId,
        establishmentId: ctx.establishmentId,
        number: orderNumber,
        mode: input.mode,
        tableId: input.tableId,
        tableLabel,
        waiterId: ctx.userId,
        waiterName: ctx.userName,
        deviceCode: ctx.deviceCode,
        createdAt,
        lines,
        total: linesTotal(lines, currency),
        invoiceIds: invoices.map((invoice) => invoice.id),
      };

      await db.orders.add(order);
      await db.invoices.bulkAdd(invoices);
      if (options.enqueue !== false) {
        await db.outbox.add(
          createOperation({
            id: uuidv7(),
            type: "restaurant.order.created",
            // Forme validée par orderCreatedSchema (schemas/sync.ts) : le serveur
            // recalcule les prix et revérifie la répartition par point de service.
            payload: {
              orderId,
              number: orderNumber,
              createdAt,
              mode: input.mode,
              tableId: input.tableId,
              lines: input.lines,
              invoices: invoices.map((invoice) => ({
                id: invoice.id,
                number: invoice.number,
                servicePointId: invoice.servicePointId,
              })),
            } satisfies OrderCreatedPayload,
            establishmentId: ctx.establishmentId,
            userId: ctx.userId,
            deviceId: ctx.deviceId,
            createdAt,
          }),
        );
      }
      return { order, invoices };
    },
  );
}

/** Suivi de préparation d'une facture d'avance (EF-PRE-02 côté serveur). */
export async function setInvoicePrepStatus(
  db: RestaurantDb,
  ctx: DeviceContext,
  invoiceId: string,
  status: PrepStatus,
): Promise<void> {
  assertPermission(ctx, "restaurant.order.prep-status", "changer le statut d'une commande");
  await db.transaction("rw", db.invoices, db.outbox, async () => {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) throw new DomainError("INVOICE_NOT_FOUND", "Cette facture est introuvable.");
    if (invoice.paymentStatus === "cancelled") {
      throw new DomainError("INVOICE_CANCELLED", "Cette facture est annulée.");
    }
    await db.invoices.update(invoiceId, { prepStatus: status });
    await db.outbox.add(
      createOperation({
        id: uuidv7(),
        type: "restaurant.invoice.prep-status-changed",
        payload: { invoiceId, status },
        establishmentId: ctx.establishmentId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        createdAt: new Date().toISOString(),
      }),
    );
  });
}

/** Ajoute un élément au menu (EF-RES-03 ; réservé au gérant, RG-RES-02). */
export async function addMenuItem(
  db: RestaurantDb,
  ctx: DeviceContext,
  rawInput: MenuItemInput,
): Promise<MenuItem> {
  assertPermission(ctx, "restaurant.menu.manage", "modifier le menu");
  const input = menuItemInputSchema.parse(rawInput);
  const createdAt = new Date().toISOString();
  return db.transaction("rw", db.menuItems, db.servicePoints, db.outbox, async () => {
    const point = await db.servicePoints.get(input.servicePointId);
    if (!point)
      throw new DomainError("SERVICE_POINT_NOT_FOUND", "Ce point de service n'existe pas.");
    const item: MenuItem = {
      id: uuidv7(),
      establishmentId: ctx.establishmentId,
      servicePointId: input.servicePointId,
      name: input.name,
      description: input.description,
      category: input.category,
      unit: input.unit,
      price:
        input.priceMajor === null ? null : moneyFromMajor(input.priceMajor, ctx.settings.currency),
      createdAt,
      archivedAt: null,
    };
    await db.menuItems.add(item);
    await db.outbox.add(
      createOperation({
        id: uuidv7(),
        type: "restaurant.menu-item.created",
        payload: { item },
        establishmentId: ctx.establishmentId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        createdAt,
      }),
    );
    return item;
  });
}

/** Propositions du stock du matin d'une journée, par élément (EF-REQ-04). */
export async function morningProposals(
  db: RestaurantDb,
  ctx: DeviceContext,
  dayStartIso: string,
): Promise<Map<string, number | null>> {
  const { businessDayStartHour, timeZone } = ctx.settings;
  const previousStart = new Date(new Date(dayStartIso).getTime() - DAY_MS).toISOString();
  const previousDay = businessDayKey(previousStart, businessDayStartHour, timeZone);
  const [previousMorning, previousSold, items, previousCounts] = await Promise.all([
    currentMorningStock(db, previousDay),
    soldQuantitiesBetween(db, previousStart, dayStartIso),
    db.menuItems.toArray(),
    db.stockCounts.where("day").equals(previousDay).toArray(),
  ]);
  const counted = new Map<string, number>();
  for (const count of latestStockCounts(previousCounts, previousDay).values()) {
    for (const line of count.lines) counted.set(line.menuItemId, line.counted);
  }
  return new Map(
    items.map((item) => [
      item.id,
      proposeMorningQuantity({
        previousMorning: previousMorning.get(item.id)?.quantity ?? null,
        previousSold: previousSold.get(item.id) ?? 0,
        previousCounted: counted.get(item.id) ?? null,
        // HYPOTHÈSE D-Q14 : les réquisitions ne sont pas encore gérées.
        requisitioned: null,
      }),
    ]),
  );
}

export type MorningStockLine = { menuItemId: string; quantity: number | null; reason: string };

/**
 * Enregistre (ou corrige) le stock du matin d'un point de service
 * (EF-REQ-03, EF-REQ-04, RG-REQ-02). Les propositions sont recalculées ici,
 * jamais reprises de l'écran. Seules les lignes nouvelles ou modifiées créent
 * une saisie ; une correction remplace la précédente sans l'effacer.
 */
export async function saveMorningStock(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { servicePointId: string; lines: readonly MorningStockLine[] },
  options: { enteredAt?: string; enqueue?: boolean } = {},
): Promise<MorningStockEntry[]> {
  assertPermission(ctx, "restaurant.morning-stock.enter", "saisir le stock du matin");
  const enteredAt = options.enteredAt ?? new Date().toISOString();
  const { businessDayStartHour, timeZone } = ctx.settings;
  const dayStart = businessDayStart(enteredAt, businessDayStartHour, timeZone);
  const day = businessDayKey(enteredAt, businessDayStartHour, timeZone);

  return db.transaction(
    "rw",
    // stockCounts : la proposition part du stock compté à la clôture de la veille.
    [
      db.servicePoints,
      db.menuItems,
      db.invoices,
      db.morningStockEntries,
      db.stockCounts,
      db.outbox,
    ],
    async () => {
      const point = await db.servicePoints.get(input.servicePointId);
      if (!point) {
        throw new DomainError("SERVICE_POINT_NOT_FOUND", "Ce point de service n'existe pas.");
      }
      const items = itemsRequiringMorningStock(await db.menuItems.toArray(), point.id);
      const itemIds = new Set(items.map((item) => item.id));
      if (input.lines.some((line) => !itemIds.has(line.menuItemId))) {
        throw new DomainError(
          "ITEM_NOT_FOUND",
          "Un élément saisi n'appartient pas au menu de ce point de service.",
        );
      }
      const linesById = new Map(input.lines.map((line) => [line.menuItemId, line]));
      const proposals = await morningProposals(db, ctx, dayStart);
      const current = await currentMorningStock(db, day);

      const checked = items.map((item) => {
        const line = linesById.get(item.id);
        return {
          menuItemId: item.id,
          name: item.name,
          quantity: line?.quantity ?? null,
          proposed: proposals.get(item.id) ?? null,
          previous: current.get(item.id)?.quantity ?? null,
          reason: line?.reason ?? "",
        };
      });
      const issue = validateMorningLines(checked)[0];
      if (issue) throw new DomainError(issue.code, issue.message);

      const entries: MorningStockEntry[] = checked
        .filter((line) => line.previous === null || line.quantity !== line.previous)
        .map((line) => ({
          id: uuidv7(new Date(enteredAt).getTime()),
          establishmentId: ctx.establishmentId,
          day,
          servicePointId: point.id,
          menuItemId: line.menuItemId,
          quantity: line.quantity ?? 0,
          proposed: line.proposed,
          reason: line.reason.trim() === "" ? null : line.reason.trim(),
          replacesId: current.get(line.menuItemId)?.id ?? null,
          enteredAt,
          enteredBy: ctx.userId,
          enteredByName: ctx.userName,
        }));
      if (entries.length === 0) return [];

      await db.morningStockEntries.bulkAdd(entries);
      if (options.enqueue !== false) {
        await db.outbox.add(
          createOperation({
            id: uuidv7(),
            type: "restaurant.morning-stock.entered",
            payload: { day, servicePointId: point.id, entries },
            establishmentId: ctx.establishmentId,
            userId: ctx.userId,
            deviceId: ctx.deviceId,
            createdAt: enteredAt,
          }),
        );
      }
      return entries;
    },
  );
}

function tableOperation(ctx: DeviceContext, type: string, payload: unknown, createdAt: string) {
  return createOperation({
    id: uuidv7(),
    type,
    payload,
    establishmentId: ctx.establishmentId,
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    createdAt,
  });
}

/** Ajoute une table, numérotée à la suite par défaut (EF-RES-04, gérant). */
export async function addTable(
  db: RestaurantDb,
  ctx: DeviceContext,
  label?: string,
): Promise<DiningTable> {
  assertPermission(ctx, "restaurant.table.manage", "gérer les tables");
  const createdAt = new Date().toISOString();
  return db.transaction("rw", db.diningTables, db.outbox, async () => {
    const tables = await db.diningTables.toArray();
    const finalLabel = (
      label ?? nextTableLabel(tables.filter((t) => t.archivedAt === null))
    ).trim();
    const error = validateTableLabel(finalLabel, tables);
    if (error) throw new DomainError("INVALID_TABLE_LABEL", error);
    const table: DiningTable = {
      id: uuidv7(),
      establishmentId: ctx.establishmentId,
      label: finalLabel,
      sortOrder: Math.max(0, ...tables.map((t) => t.sortOrder)) + 1,
      createdAt,
      archivedAt: null,
    };
    await db.diningTables.add(table);
    await db.outbox.add(tableOperation(ctx, "restaurant.table.created", { table }, createdAt));
    return table;
  });
}

/** Renomme une table ; les commandes passées gardent le libellé d'origine. */
export async function renameTable(
  db: RestaurantDb,
  ctx: DeviceContext,
  tableId: string,
  label: string,
): Promise<void> {
  assertPermission(ctx, "restaurant.table.manage", "gérer les tables");
  const updatedAt = new Date().toISOString();
  await db.transaction("rw", db.diningTables, db.outbox, async () => {
    const tables = await db.diningTables.toArray();
    const table = tables.find((t) => t.id === tableId);
    if (!table) throw new DomainError("TABLE_NOT_FOUND", "Cette table n'existe plus.");
    const error = validateTableLabel(label, tables, tableId);
    if (error) throw new DomainError("INVALID_TABLE_LABEL", error);
    if (table.label === label.trim()) return;
    await db.diningTables.update(tableId, { label: label.trim() });
    await db.outbox.add(
      tableOperation(
        ctx,
        "restaurant.table.renamed",
        { tableId, before: table.label, after: label.trim() },
        updatedAt,
      ),
    );
  });
}

/**
 * Archive ou rétablit une table (jamais de suppression : RG-CAT-01 appliqué
 * aux tables). Une table occupée ne peut pas être archivée.
 */
export async function setTableArchived(
  db: RestaurantDb,
  ctx: DeviceContext,
  tableId: string,
  archived: boolean,
  options: { isOccupied: boolean },
): Promise<void> {
  assertPermission(ctx, "restaurant.table.manage", "gérer les tables");
  const at = new Date().toISOString();
  await db.transaction("rw", db.diningTables, db.outbox, async () => {
    const tables = await db.diningTables.toArray();
    const table = tables.find((t) => t.id === tableId);
    if (!table) throw new DomainError("TABLE_NOT_FOUND", "Cette table n'existe plus.");
    if (archived && options.isOccupied) {
      throw new DomainError(
        "TABLE_OCCUPIED",
        `« ${table.label} » est occupée : libérez-la avant de la retirer du service.`,
      );
    }
    if (!archived) {
      const error = validateTableLabel(table.label, tables, tableId);
      if (error) throw new DomainError("INVALID_TABLE_LABEL", error);
    }
    await db.diningTables.update(tableId, { archivedAt: archived ? at : null });
    await db.outbox.add(
      tableOperation(
        ctx,
        archived ? "restaurant.table.archived" : "restaurant.table.restored",
        { tableId },
        at,
      ),
    );
  });
}

/** Libère une table : à la main, ou à l'encaissement qui solde l'addition (D-033, D-055). */
export async function releaseTable(
  db: RestaurantDb,
  ctx: DeviceContext,
  tableId: string,
  options: { releasedAt?: string; enqueue?: boolean } = {},
): Promise<TableRelease> {
  assertPermission(ctx, "restaurant.table.release", "libérer une table");
  const releasedAt = options.releasedAt ?? new Date().toISOString();
  return db.transaction("rw", db.diningTables, db.tableReleases, db.outbox, async () => {
    const table = await db.diningTables.get(tableId);
    if (!table) throw new DomainError("TABLE_NOT_FOUND", "Cette table n'existe plus.");
    const release: TableRelease = {
      id: uuidv7(new Date(releasedAt).getTime()),
      establishmentId: ctx.establishmentId,
      tableId,
      releasedAt,
      releasedBy: ctx.userId,
      releasedByName: ctx.userName,
    };
    await db.tableReleases.add(release);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(ctx, "restaurant.table.released", { release }, releasedAt),
      );
    }
    return release;
  });
}

/** Taux du dollar en vigueur : le dernier saisi (RG-PRX-02 : un taux ne se modifie pas). */
export async function currentExchangeRate(db: RestaurantDb): Promise<ExchangeRate | null> {
  return (await db.exchangeRates.orderBy("effectiveAt").last()) ?? null;
}

/** Ajoute le taux du jour « 1 USD = X CDF » (EF-PRX-05, D-042 ; gérant). */
export async function addExchangeRate(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: string,
  options: { effectiveAt?: string; enqueue?: boolean } = {},
): Promise<ExchangeRate> {
  assertPermission(ctx, "restaurant.exchange-rate.manage", "saisir le taux du dollar");
  const parsed = parseRate(input);
  if (!parsed.ok) throw new DomainError("INVALID_RATE", parsed.message);
  const effectiveAt = options.effectiveAt ?? new Date().toISOString();
  const rate: ExchangeRate = {
    id: uuidv7(new Date(effectiveAt).getTime()),
    establishmentId: ctx.establishmentId,
    rate: parsed.rate,
    effectiveAt,
    enteredBy: ctx.userId,
    enteredByName: ctx.userName,
  };
  await db.transaction("rw", db.exchangeRates, db.outbox, async () => {
    await db.exchangeRates.add(rate);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "restaurant.exchange-rate.added",
          { rate: { id: rate.id, rate: rate.rate, effectiveAt } },
          effectiveAt,
        ),
      );
    }
  });
  return rate;
}

/**
 * Enregistre un paiement (EF-ENC-02, D-032, D-033) : relit les factures et
 * les paiements déjà reçus, calcule le reste à payer, la contre-valeur au
 * taux du jour et la monnaie à rendre, puis affecte le montant réglé aux
 * factures, les plus anciennes d'abord. Un serveur n'encaisse que ses
 * propres ventes ; un gérant peut encaisser à sa place.
 */
export async function recordPayment(
  db: RestaurantDb,
  ctx: DeviceContext,
  rawInput: PaymentInput,
  options: { createdAt?: string; enqueue?: boolean } = {},
): Promise<Payment> {
  assertPermission(ctx, "restaurant.payment.collect", "encaisser");
  const parsed = paymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      "INVALID_PAYMENT",
      parsed.error.issues[0]?.message ?? "Le paiement n'est pas valide.",
    );
  }
  const input = parsed.data;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const base = ctx.settings.currency;

  return db.transaction("rw", [db.invoices, db.payments, db.exchangeRates, db.outbox], async () => {
    const found = await db.invoices.bulkGet(input.invoiceIds);
    const invoices: AdvanceInvoice[] = [];
    for (const invoice of found) {
      if (!invoice) {
        throw new DomainError("INVOICE_NOT_FOUND", "Une facture à encaisser est introuvable.");
      }
      if (invoice.paymentStatus === "cancelled") {
        throw new DomainError("INVOICE_CANCELLED", `La facture ${invoice.number} est annulée.`);
      }
      if (ctx.role === "waiter" && invoice.waiterId !== ctx.userId) {
        throw new DomainError(
          "FORBIDDEN",
          `La facture ${invoice.number} appartient à ${invoice.waiterName} : seul ce serveur ou un gérant peut l'encaisser.`,
        );
      }
      invoices.push(invoice);
    }
    invoices.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number),
    );

    // Un paiement ne précède jamais sa facture : il suffit de relire ceux qui la suivent.
    const since = invoices[0]?.createdAt ?? createdAt;
    const previous = await db.payments.where("createdAt").aboveOrEqual(since).toArray();
    const balances = invoiceBalances(invoices, previous);
    const open: { id: string; remaining: Money }[] = [];
    for (const invoice of invoices) {
      const remaining = balances.get(invoice.id)?.remaining;
      if (remaining && remaining.amountMinor > 0) open.push({ id: invoice.id, remaining });
    }
    const due = remainingDue(
      open.map((entry) => entry.id),
      balances,
      base,
    );

    const rate = input.currency === base ? null : await currentExchangeRate(db);
    const tendered = moneyFromMajor(input.amountMajor, input.currency);
    const settlement = settlePayment({
      due,
      tendered,
      method: input.method,
      rate: rate?.rate ?? null,
    });
    if (!settlement.ok) throw new DomainError(settlement.code, settlement.message);

    const payment: Payment = {
      id: uuidv7(new Date(createdAt).getTime()),
      establishmentId: ctx.establishmentId,
      method: input.method,
      provider: input.method === "mobile-money" ? input.provider : null,
      reference: input.method === "mobile-money" ? input.reference : null,
      tendered,
      rate: rate ? { id: rate.id, rate: rate.rate } : null,
      baseAmount: settlement.baseAmount,
      change: settlement.change,
      allocations: allocatePayment(settlement.applied, open),
      collectedBy: ctx.userId,
      collectedByName: ctx.userName,
      deviceCode: ctx.deviceCode,
      createdAt,
    };
    await db.payments.add(payment);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "restaurant.payment.recorded",
          {
            payment: {
              id: payment.id,
              method: payment.method,
              provider: payment.provider,
              reference: payment.reference,
              tendered: { amountMinor: tendered.amountMinor, currency: tendered.currency },
              rateId: payment.rate?.id ?? null,
              changeMinor: payment.change.amountMinor,
              allocations: payment.allocations.map((allocation) => ({
                invoiceId: allocation.invoiceId,
                amountMinor: allocation.amount.amountMinor,
              })),
              createdAt,
            },
          } satisfies PaymentRecordedPayload,
          createdAt,
        ),
      );
    }
    return payment;
  });
}

// ─── Clôtures de service (EF-CLO-01 à 04, D-039, D-056) ─────────────────────

/** Journées déjà validées par le gérant (RG-CLO-02 : plus rien ne s'y ajoute). */
export async function validatedDays(db: RestaurantDb): Promise<Set<string>> {
  return new Set((await db.dayClosings.toArray()).map((closing) => closing.day));
}

export type CashClosingDraft = {
  day: string;
  payments: Payment[];
  lines: Omit<CashClosingLine, "counted">[];
  byServicePoint: CashClosing["byServicePoint"];
  unpaidInvoiceIds: string[];
};

/**
 * Ce que la personne active doit déclarer (EF-CLO-01) : ses paiements pas
 * encore clôturés, l'attendu par mode de paiement, la part de chaque point de
 * service et ses factures encore impayées (RG-ENC-02).
 */
export async function cashClosingDraft(
  db: RestaurantDb,
  ctx: DeviceContext,
  at: string = new Date().toISOString(),
): Promise<CashClosingDraft> {
  const { currency, businessDayStartHour, timeZone } = ctx.settings;
  const day = currentDayKey(at, await validatedDays(db), businessDayStartHour, timeZone);
  const dayStart = businessDayStartOf(day, businessDayStartHour, timeZone);
  const [mine, closings] = await Promise.all([
    db.payments.where("collectedBy").equals(ctx.userId).toArray(),
    db.cashClosings.where("userId").equals(ctx.userId).toArray(),
  ]);
  const payments = unclosedPayments(mine, closings, ctx.userId)
    .filter((payment) => payment.createdAt <= at)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allocated = await db.invoices.bulkGet([
    ...new Set(payments.flatMap((payment) => payment.allocations.map((a) => a.invoiceId))),
  ]);
  const ownInvoices = (
    await db.invoices.where("createdAt").aboveOrEqual(dayStart).toArray()
  ).filter((invoice) => invoice.waiterId === ctx.userId && invoice.createdAt <= at);
  const dayPayments = await db.payments.where("createdAt").aboveOrEqual(dayStart).toArray();
  return {
    day,
    payments,
    lines: expectedCashLines(payments, currency),
    byServicePoint: collectedByServicePoint(
      payments,
      allocated.filter((invoice) => invoice !== undefined),
      currency,
    ),
    unpaidInvoiceIds: unpaidInvoiceIds(
      ownInvoices,
      invoiceBalances(ownInvoices, dayPayments),
      ctx.userId,
    ),
  };
}

/**
 * Déclare la caisse de la personne active (EF-CLO-02, D-032) : montant compté
 * par mode de paiement, écart figé, commentaire exigé s'il n'est pas nul.
 * `counted` donne, pour chaque ligne attendue, le montant en unité principale.
 */
export async function declareCashClosing(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { counted: Readonly<Record<string, number>>; comment: string },
  options: { declaredAt?: string; enqueue?: boolean } = {},
): Promise<CashClosing> {
  assertPermission(ctx, "restaurant.closing.declare", "déclarer une caisse");
  const declaredAt = options.declaredAt ?? new Date().toISOString();
  return db.transaction(
    "rw",
    [db.payments, db.invoices, db.cashClosings, db.dayClosings, db.outbox],
    async () => {
      const draft = await cashClosingDraft(db, ctx, declaredAt);
      const lines: CashClosingLine[] = draft.lines.map((line) => {
        const value = input.counted[line.key];
        if (value === undefined || !Number.isFinite(value) || value < 0) {
          throw new DomainError(
            "COUNTED_REQUIRED",
            "Saisissez le montant compté pour chaque mode de paiement (0 s'il n'y a rien).",
          );
        }
        return { ...line, counted: moneyFromMajor(value, line.expected.currency) };
      });
      const issue = validateCashClosing({
        lines,
        unpaidInvoiceIds: draft.unpaidInvoiceIds,
        comment: input.comment,
      });
      if (issue) throw new DomainError(issue.code, issue.message);

      const closing: CashClosing = {
        id: uuidv7(new Date(declaredAt).getTime()),
        establishmentId: ctx.establishmentId,
        day: draft.day,
        userId: ctx.userId,
        userName: ctx.userName,
        deviceCode: ctx.deviceCode,
        declaredAt,
        paymentIds: draft.payments.map((payment) => payment.id),
        lines,
        byServicePoint: draft.byServicePoint,
        unpaidInvoiceIds: draft.unpaidInvoiceIds,
        comment: input.comment.trim() === "" ? null : input.comment.trim(),
      };
      await db.cashClosings.add(closing);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "restaurant.cash-closing.declared",
            {
              closing: {
                id: closing.id,
                day: closing.day,
                declaredAt,
                paymentIds: closing.paymentIds,
                counted: lines.map((line) => ({
                  key: line.key,
                  amountMinor: line.counted.amountMinor,
                  currency: line.counted.currency,
                })),
                comment: closing.comment,
              },
            } satisfies CashClosingDeclaredPayload,
            declaredAt,
          ),
        );
      }
      return closing;
    },
  );
}

/**
 * Lignes du comptage d'un point de service (EF-CLO-03) : stock du matin en
 * vigueur et ventes de la journée, pour chaque élément vendable.
 */
export async function stockCountDraft(
  db: RestaurantDb,
  ctx: DeviceContext,
  servicePointId: string,
  day: string,
): Promise<Omit<StockCountLine, "counted" | "declaredOut" | "outReason">[]> {
  const { businessDayStartHour, timeZone } = ctx.settings;
  const dayStart = businessDayStartOf(day, businessDayStartHour, timeZone);
  const [items, morning, sold] = await Promise.all([
    db.menuItems.toArray(),
    currentMorningStock(db, day),
    soldQuantitiesBetween(db, dayStart, nextDayIso(dayStart)),
  ]);
  return itemsRequiringMorningStock(items, servicePointId).map((item) => ({
    menuItemId: item.id,
    name: item.name,
    unit: item.unit,
    morning: morning.get(item.id)?.quantity ?? null,
    sold: sold.get(item.id) ?? 0,
  }));
}

export type StockCountInputLine = {
  menuItemId: string;
  counted: number | null;
  declaredOut: number;
  outReason: string;
};

/**
 * Enregistre le comptage de fin de service d'un point de service (EF-CLO-03,
 * D-044 ; gérant). Un nouveau comptage remplace le précédent tant que la
 * journée n'est pas validée (le plus récent fait foi, l'historique reste).
 */
export async function recordStockCount(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { servicePointId: string; lines: readonly StockCountInputLine[]; comment: string },
  options: { countedAt?: string; enqueue?: boolean } = {},
): Promise<StockCount> {
  assertPermission(ctx, "restaurant.closing.count-stock", "compter le stock");
  const countedAt = options.countedAt ?? new Date().toISOString();
  return db.transaction(
    "rw",
    [
      db.servicePoints,
      db.menuItems,
      db.invoices,
      db.morningStockEntries,
      db.stockCounts,
      db.dayClosings,
      db.outbox,
    ],
    async () => {
      const point = await db.servicePoints.get(input.servicePointId);
      if (!point) {
        throw new DomainError("SERVICE_POINT_NOT_FOUND", "Ce point de service n'existe pas.");
      }
      const { businessDayStartHour, timeZone } = ctx.settings;
      const day = currentDayKey(countedAt, await validatedDays(db), businessDayStartHour, timeZone);
      const draft = await stockCountDraft(db, ctx, point.id, day);
      const byId = new Map(input.lines.map((line) => [line.menuItemId, line]));
      const lines: StockCountLine[] = draft.map((line) => {
        const entry = byId.get(line.menuItemId);
        if (!entry || entry.counted === null) {
          throw new DomainError(
            "COUNTED_REQUIRED",
            `Saisissez le stock compté de « ${line.name} » (0 s'il n'y en a plus).`,
          );
        }
        return {
          ...line,
          counted: entry.counted,
          declaredOut: entry.declaredOut,
          outReason: entry.outReason.trim() === "" ? null : entry.outReason.trim(),
        };
      });
      const issue = validateStockCount({ lines, comment: input.comment })[0];
      if (issue) throw new DomainError(issue.code, issue.message);

      const count: StockCount = {
        id: uuidv7(new Date(countedAt).getTime()),
        establishmentId: ctx.establishmentId,
        day,
        servicePointId: point.id,
        countedAt,
        countedBy: ctx.userId,
        countedByName: ctx.userName,
        lines,
        comment: input.comment.trim() === "" ? null : input.comment.trim(),
      };
      await db.stockCounts.add(count);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "restaurant.stock.counted",
            {
              count: {
                id: count.id,
                day,
                servicePointId: point.id,
                countedAt,
                lines: lines.map((line) => ({
                  menuItemId: line.menuItemId,
                  counted: line.counted,
                  declaredOut: line.declaredOut,
                  outReason: line.outReason,
                })),
                comment: count.comment,
              },
            } satisfies StockCountedPayload,
            countedAt,
          ),
        );
      }
      return count;
    },
  );
}

export type DayClosingStatus = {
  day: string;
  dayStart: string;
  isValidated: boolean;
  cashClosings: CashClosing[];
  stockCounts: Map<string, StockCount>;
  undeclared: { userId: string; name: string; payments: number }[];
  pointsMissingMorningStock: ServicePoint[];
  pointsNotCounted: ServicePoint[];
};

/** État de la journée à valider : ce qui est déclaré, compté, et ce qui manque. */
export async function dayClosingStatus(
  db: RestaurantDb,
  ctx: DeviceContext,
  at: string = new Date().toISOString(),
): Promise<DayClosingStatus> {
  const { businessDayStartHour, timeZone } = ctx.settings;
  const validated = await validatedDays(db);
  const day = currentDayKey(at, validated, businessDayStartHour, timeZone);
  const dayStart = businessDayStartOf(day, businessDayStartHour, timeZone);
  const [points, items, payments, closings, counts, morning] = await Promise.all([
    db.servicePoints.orderBy("sortOrder").toArray(),
    db.menuItems.toArray(),
    db.payments.where("createdAt").between(dayStart, at, true, true).toArray(),
    db.cashClosings.toArray(),
    db.stockCounts.where("day").equals(day).toArray(),
    currentMorningStock(db, day),
  ]);
  const latest = latestStockCounts(counts, day);
  const required = points.filter((point) => itemsRequiringMorningStock(items, point.id).length > 0);
  return {
    day,
    dayStart,
    isValidated: validated.has(day),
    cashClosings: closings.filter((closing) => closing.day === day),
    stockCounts: latest,
    undeclared: collectorsWithUnclosedPayments(payments, closings),
    pointsMissingMorningStock: required.filter(
      (point) => !isMorningStockComplete(items, point.id, morning),
    ),
    pointsNotCounted: required.filter((point) => !latest.has(point.id)),
  };
}

/**
 * Valide la journée (EF-CLO-04 ; gérant). Refusée tant que manquent le stock
 * du matin (RG-REQ-03), un comptage (EF-CLO-03), une déclaration de caisse
 * (RG-CLO-01) ou l'envoi des opérations de l'appareil (RG-CLO-03). Le serveur
 * refait ces contrôles avec les données de tous les appareils.
 *
 * Hors démonstration, rien n'est écrit sur l'appareil : la validation n'existe
 * qu'une fois acceptée par le serveur, qui la renvoie aux appareils.
 */
export async function validateDay(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { comment: string; isOnline: boolean; writeLocally: boolean },
  options: { validatedAt?: string } = {},
): Promise<{ id: string; day: string; operationId: string }> {
  assertPermission(ctx, "restaurant.closing.validate", "valider la journée");
  const validatedAt = options.validatedAt ?? new Date().toISOString();
  const status = await dayClosingStatus(db, ctx, validatedAt);
  const pending = await db.outbox.where("status").equals("pending").count();
  const issue = dayClosingIssues({
    isAlreadyValidated: status.isValidated,
    pointsMissingMorningStock: status.pointsMissingMorningStock.map((point) => point.name),
    pointsNotCounted: status.pointsNotCounted.map((point) => point.name),
    undeclaredCollectors: status.undeclared.map((entry) => entry.name),
    pendingOperations: input.writeLocally ? 0 : pending,
    isOnline: input.writeLocally || input.isOnline,
  })[0];
  if (issue) throw new DomainError(issue.code, issue.message);

  const comment = input.comment.trim() === "" ? null : input.comment.trim();
  const id = uuidv7(new Date(validatedAt).getTime());
  const operation = tableOperation(
    ctx,
    "restaurant.day.validated",
    { closing: { id, day: status.day, validatedAt, comment } } satisfies DayValidatedPayload,
    validatedAt,
  );
  await db.transaction("rw", db.dayClosings, db.outbox, async () => {
    if (input.writeLocally) {
      await db.dayClosings.add({
        id,
        establishmentId: ctx.establishmentId,
        day: status.day,
        validatedAt,
        validatedBy: ctx.userId,
        validatedByName: ctx.userName,
        cashClosingIds: status.cashClosings.map((closing) => closing.id),
        stockCountIds: [...status.stockCounts.values()].map((count) => count.id),
        comment,
      });
    } else {
      // Hors démonstration, la validation n'existe qu'une fois acceptée par le serveur.
      await db.outbox.add(operation);
    }
  });
  return { id, day: status.day, operationId: operation.id };
}

// ─── Annulations et remises validées par le gérant (D-058) ──────────────────

/** Factures actives d'une commande et leurs soldes (paiements et remises compris). */
async function orderBalances(db: RestaurantDb, orderId: string) {
  const invoices = await db.invoices.where("orderId").equals(orderId).toArray();
  const since = invoices.map((invoice) => invoice.createdAt).sort()[0] ?? new Date(0).toISOString();
  const payments = await db.payments.where("createdAt").aboveOrEqual(since).toArray();
  return { invoices, balances: invoiceBalances(invoices, payments) };
}

/** RG-CLO-02 : la commande appartient-elle à une journée validée ? */
async function isOrderDayValidated(
  db: RestaurantDb,
  ctx: DeviceContext,
  order: Pick<Order, "createdAt">,
): Promise<boolean> {
  const { businessDayStartHour, timeZone } = ctx.settings;
  const day = businessDayKey(order.createdAt, businessDayStartHour, timeZone);
  return (await db.dayClosings.where("day").equals(day).count()) > 0;
}

export type AdjustmentInput = {
  kind: AdjustmentKind;
  orderId: string;
  reason: string;
  /** Remise demandée, en unité principale ; ignorée pour une annulation. */
  discountMajor?: number | null;
};

/**
 * Demande une annulation ou une remise sur une commande (RG-CMD-02,
 * RG-VTE-02, RG-ENC-01). Un serveur ne demande que sur ses commandes
 * (RG-CMD-03). Un gérant qui agit lui-même valide dans le même geste.
 */
export async function requestAdjustment(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: AdjustmentInput,
  options: { requestedAt?: string; enqueue?: boolean } = {},
): Promise<{ request: AdjustmentRequest; decision: AdjustmentDecision | null }> {
  assertPermission(ctx, "restaurant.adjustment.request", "demander une annulation ou une remise");
  const requestedAt = options.requestedAt ?? new Date().toISOString();
  const request = await db.transaction(
    "rw",
    [
      db.orders,
      db.invoices,
      db.payments,
      db.dayClosings,
      db.adjustmentRequests,
      db.adjustmentDecisions,
      db.outbox,
    ],
    async () => {
      const order = await db.orders.get(input.orderId);
      if (!order) throw new DomainError("ORDER_NOT_FOUND", "Cette commande est introuvable.");
      if (ctx.role === "waiter" && order.waiterId !== ctx.userId) {
        throw new DomainError(
          "FORBIDDEN",
          `Cette commande appartient à ${order.waiterName} : lui seul ou le gérant peut demander un ajustement (RG-CMD-03).`,
        );
      }
      const { invoices, balances } = await orderBalances(db, order.id);
      const [requests, decisions] = await Promise.all([
        db.adjustmentRequests.where("orderId").equals(order.id).toArray(),
        db.adjustmentDecisions.toArray(),
      ]);
      const discount =
        input.kind === "discount" && input.discountMajor
          ? moneyFromMajor(input.discountMajor, ctx.settings.currency)
          : null;
      const issue = adjustmentIssue({
        kind: input.kind,
        reason: input.reason,
        discount,
        balances: invoices.flatMap((invoice) => {
          const balance = balances.get(invoice.id);
          return balance ? [balance] : [];
        }),
        isDayValidated: await isOrderDayValidated(db, ctx, order),
        hasPendingRequest: pendingRequests(requests, decisions).length > 0,
      });
      if (issue) throw new DomainError(issue.code, issue.message);

      const created: AdjustmentRequest = {
        id: uuidv7(new Date(requestedAt).getTime()),
        establishmentId: ctx.establishmentId,
        kind: input.kind,
        orderId: order.id,
        invoiceIds: invoices
          .filter((invoice) => invoice.paymentStatus !== "cancelled")
          .map((invoice) => invoice.id),
        reason: input.reason.trim(),
        discount,
        requestedBy: ctx.userId,
        requestedByName: ctx.userName,
        requestedAt,
        deviceCode: ctx.deviceCode,
      };
      await db.adjustmentRequests.add(created);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "restaurant.adjustment.requested",
            {
              request: {
                id: created.id,
                kind: created.kind,
                orderId: created.orderId,
                reason: created.reason,
                discountMinor: discount?.amountMinor ?? null,
                requestedAt,
              },
            } satisfies AdjustmentRequestedPayload,
            requestedAt,
          ),
        );
      }
      return created;
    },
  );
  const decision = hasPermission(ctx.role, "restaurant.adjustment.approve")
    ? await decideAdjustment(
        db,
        ctx,
        { requestId: request.id, approved: true, comment: "" },
        { decidedAt: requestedAt, ...(options.enqueue === false ? { enqueue: false } : {}) },
      )
    : null;
  return { request, decision };
}

/**
 * Le gérant valide ou refuse une demande (matrice des droits). À la
 * validation, l'annulation ou la remise est appliquée aux factures, après un
 * nouveau contrôle : un paiement a pu arriver depuis la demande.
 */
export async function decideAdjustment(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { requestId: string; approved: boolean; comment: string },
  options: { decidedAt?: string; enqueue?: boolean } = {},
): Promise<AdjustmentDecision> {
  assertPermission(ctx, "restaurant.adjustment.approve", "valider une demande");
  const decidedAt = options.decidedAt ?? new Date().toISOString();
  return db.transaction(
    "rw",
    [
      db.orders,
      db.invoices,
      db.payments,
      db.dayClosings,
      db.adjustmentRequests,
      db.adjustmentDecisions,
      db.outbox,
    ],
    async () => {
      const request = await db.adjustmentRequests.get(input.requestId);
      if (!request) throw new DomainError("REQUEST_NOT_FOUND", "Cette demande est introuvable.");
      if ((await db.adjustmentDecisions.where("requestId").equals(request.id).count()) > 0) {
        throw new DomainError("ALREADY_DECIDED", "Cette demande a déjà reçu une décision.");
      }
      if (!input.approved && input.comment.trim().length < MIN_ADJUSTMENT_REASON) {
        throw new DomainError(
          "COMMENT_REQUIRED",
          "Expliquez au serveur pourquoi la demande est refusée.",
        );
      }
      const order = await db.orders.get(request.orderId);
      const { invoices, balances } = await orderBalances(db, request.orderId);
      const targets = invoices.filter((invoice) => request.invoiceIds.includes(invoice.id));
      let discounts: PaymentAllocation[] = [];
      if (input.approved) {
        const issue = adjustmentIssue({
          kind: request.kind,
          reason: request.reason,
          discount: request.discount,
          balances: targets.flatMap((invoice) => {
            const balance = balances.get(invoice.id);
            return balance ? [balance] : [];
          }),
          isDayValidated: order ? await isOrderDayValidated(db, ctx, order) : false,
          hasPendingRequest: false,
        });
        if (issue) throw new DomainError(issue.code, issue.message);
        if (request.kind === "cancel") {
          for (const invoice of targets) {
            await db.invoices.update(invoice.id, {
              paymentStatus: "cancelled",
              cancelReason: request.reason,
            });
          }
        } else if (request.discount) {
          discounts = splitDiscount(
            request.discount,
            targets.map((invoice) => ({
              id: invoice.id,
              remaining: balances.get(invoice.id)?.remaining ?? invoice.total,
            })),
          );
          for (const share of discounts) {
            const invoice = targets.find((entry) => entry.id === share.invoiceId);
            if (!invoice) continue;
            await db.invoices.update(invoice.id, {
              discount: addMoney(
                invoice.discount ?? zeroMoney(share.amount.currency),
                share.amount,
              ),
            });
          }
        }
      }
      const decision: AdjustmentDecision = {
        id: uuidv7(new Date(decidedAt).getTime()),
        establishmentId: ctx.establishmentId,
        requestId: request.id,
        approved: input.approved,
        comment: input.comment.trim() === "" ? null : input.comment.trim(),
        discounts,
        decidedBy: ctx.userId,
        decidedByName: ctx.userName,
        decidedAt,
      };
      await db.adjustmentDecisions.add(decision);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "restaurant.adjustment.decided",
            {
              decision: {
                id: decision.id,
                requestId: request.id,
                approved: input.approved,
                comment: decision.comment,
                decidedAt,
              },
            } satisfies AdjustmentDecidedPayload,
            decidedAt,
          ),
        );
      }
      return decision;
    },
  );
}
