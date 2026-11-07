import { localYear } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { uuidv7 } from "@/shared/lib/ids";
import { moneyFromMajor } from "@/shared/lib/money";
import { createOperation } from "@/offline/outbox";

import { businessDayKey, businessDayStart } from "../domain/business-day";
import { computeAvailability, maxOrderableQuantity } from "../domain/menu";
import { counterKey, formatDocumentNumber, type DocumentPrefix } from "../domain/numbering";
import { linesTotal, splitOrderByServicePoint } from "../domain/order";
import {
  currentEntries,
  itemsRequiringMorningStock,
  proposeMorningQuantity,
  validateMorningLines,
} from "../domain/morning-stock";
import type {
  AdvanceInvoice,
  MenuItem,
  MorningStockEntry,
  Order,
  OrderLine,
  PrepStatus,
} from "../domain/types";
import { menuItemInputSchema, type MenuItemInput } from "../schemas/menu-item";
import { orderInputSchema, type OrderInput } from "../schemas/order";
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
            payload: { orderId, numbers: [orderNumber, ...invoices.map((i) => i.number)], input },
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
  const [previousMorning, previousSold, items] = await Promise.all([
    currentMorningStock(db, previousDay),
    soldQuantitiesBetween(db, previousStart, dayStartIso),
    db.menuItems.toArray(),
  ]);
  return new Map(
    items.map((item) => [
      item.id,
      proposeMorningQuantity({
        previousMorning: previousMorning.get(item.id)?.quantity ?? null,
        previousSold: previousSold.get(item.id) ?? 0,
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
    [db.servicePoints, db.menuItems, db.invoices, db.morningStockEntries, db.outbox],
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
