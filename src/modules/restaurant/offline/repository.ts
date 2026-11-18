import type { z } from "zod";

import { localYear } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { uuidv7 } from "@/shared/lib/ids";
import { addMoney, moneyFromMajor, zero as zeroMoney, type Money } from "@/shared/lib/money";
import { createOperation } from "@/offline/outbox";

import { customerDebts, customerIssue, normalizePhone, outstandingOf } from "../domain/customers";
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
import { expandOrderLine, formulaIssue, optionGroupsIssue } from "../domain/menu-options";
import { canWorkStation, isDeclaredSoldOut } from "../domain/preparation";
import { counterKey, formatDocumentNumber, type DocumentPrefix } from "../domain/numbering";
import { linesTotal, splitOrderByServicePoint } from "../domain/order";
import {
  DELIVERY_OUTCOME_LABELS,
  canCollectFor,
  checkDeliveryDetails,
  courierIssue,
  failureSettlementIssue,
  lostQuantities,
  statusIssue,
  zoneFee,
  zoneIssue,
  type DeliveryDetails,
} from "../domain/delivery";
import {
  firstMorningEntryAt,
  laterRequisitioned,
  morningRequisitioned,
  requisitionKind,
  stockInOfDay,
  validateRequisition,
} from "../domain/requisition";
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
  Customer,
  Delivery,
  DeliveryOutcome,
  DeliveryStatus,
  DeliveryZone,
  MenuItem,
  DiningTable,
  ExchangeRate,
  MorningStockEntry,
  OptionGroup,
  Order,
  OrderLine,
  Payment,
  PaymentAllocation,
  PrepStatus,
  Requisition,
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
  customerCreatedSchema,
  deliveryAssignedSchema,
  deliveryFailureSettledSchema,
  deliveryStatusChangedSchema,
  deliveryZoneArchivedSchema,
  deliveryZoneSavedSchema,
  menuItemOptionsSetSchema,
  menuItemSoldOutSetSchema,
  customerLimitSetSchema,
  dayValidatedSchema,
  orderCreatedSchema,
  paymentRecordedSchema,
  requisitionCreatedSchema,
  stockCountedSchema,
} from "../schemas/sync";

type OrderCreatedPayload = z.infer<typeof orderCreatedSchema>;
type PaymentRecordedPayload = z.infer<typeof paymentRecordedSchema>;
type CashClosingDeclaredPayload = z.infer<typeof cashClosingDeclaredSchema>;
type StockCountedPayload = z.infer<typeof stockCountedSchema>;
type DeliveryZoneSavedPayload = z.infer<typeof deliveryZoneSavedSchema>;
type DeliveryZoneArchivedPayload = z.infer<typeof deliveryZoneArchivedSchema>;
type DeliveryAssignedPayload = z.infer<typeof deliveryAssignedSchema>;
type DeliveryFailureSettledPayload = z.infer<typeof deliveryFailureSettledSchema>;
type DeliveryStatusChangedPayload = z.infer<typeof deliveryStatusChangedSchema>;
type RequisitionCreatedPayload = z.infer<typeof requisitionCreatedSchema>;
type DayValidatedPayload = z.infer<typeof dayValidatedSchema>;
type AdjustmentRequestedPayload = z.infer<typeof adjustmentRequestedSchema>;
type AdjustmentDecidedPayload = z.infer<typeof adjustmentDecidedSchema>;
type CustomerCreatedPayload = z.infer<typeof customerCreatedSchema>;
type CustomerLimitSetPayload = z.infer<typeof customerLimitSetSchema>;
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
      db.requisitions,
      db.deliveryZones,
      db.deliveries,
      db.outbox,
    ],
    async () => {
      const servicePoints = await db.servicePoints.toArray();
      const itemById = new Map((await db.menuItems.toArray()).map((item) => [item.id, item]));
      const dayStart = businessDayStart(createdAt, businessDayStartHour, timeZone);
      const day = businessDayKey(createdAt, businessDayStartHour, timeZone);
      const sold = await soldQuantitiesBetween(db, dayStart, nextDayIso(dayStart));
      const morningStock = await currentMorningStock(db, day);
      // Un complément reçu pendant le service remet du stock en vente (D-069).
      const later = laterRequisitioned(
        await db.requisitions.where("day").equals(day).toArray(),
        day,
      );
      // RG-LIV-01 : les plats perdus d'une livraison échouée ne reviennent pas en vente.
      const lost = lostQuantities(
        await db.deliveries.where("createdAt").aboveOrEqual(dayStart).toArray(),
        await db.invoices
          .where("createdAt")
          .between(dayStart, nextDayIso(dayStart), true, false)
          .toArray(),
      );
      const orderId = uuidv7(new Date(createdAt).getTime());

      // D-060 : options et formules ; une formule se déplie en ses composants.
      const lines: OrderLine[] = [];
      for (const [index, requested] of input.lines.entries()) {
        const expanded = expandOrderLine(requested, itemById, `${orderId}:${index}`);
        if (!expanded.ok) throw new DomainError(expanded.code, expanded.message);
        lines.push(...expanded.lines);
      }
      // RG-RES-01 : stock du jour contrôlé élément par élément, toutes lignes confondues.
      const wanted = new Map<string, number>();
      for (const line of lines) {
        wanted.set(line.menuItemId, (wanted.get(line.menuItemId) ?? 0) + line.quantity);
      }
      for (const [menuItemId, quantity] of wanted) {
        const item: MenuItem | undefined = itemById.get(menuItemId);
        if (!item) continue;
        if (isDeclaredSoldOut(item, day)) {
          throw new DomainError(
            "ITEM_SOLD_OUT",
            `« ${item.name} » est épuisé (déclaré par le poste).`,
          );
        }
        const availability = computeAvailability(
          item,
          stockInOfDay(morningStock.get(item.id)?.quantity ?? null, later.get(item.id) ?? 0),
          (sold.get(item.id) ?? 0) + (lost.get(item.id) ?? 0),
          lowStockThreshold,
        );
        const max = maxOrderableQuantity(availability);
        if (max !== null && quantity > max) {
          throw new DomainError(
            "ITEM_SOLD_OUT",
            max <= 0
              ? `« ${item.name} » est épuisé.`
              : `Il ne reste que ${max} « ${item.name} » aujourd'hui.`,
          );
        }
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

      // EF-LIV-01, D-070 : coordonnées du client et frais de la zone, figés ici.
      let delivery: DeliveryDetails | null = null;
      if (input.mode === "delivery") {
        if (!input.delivery) {
          throw new DomainError("DELIVERY_REQUIRED", "Indiquez les coordonnées de la livraison.");
        }
        const checked = checkDeliveryDetails(input.delivery, await db.deliveryZones.toArray());
        if (!checked.ok) throw new DomainError(checked.code, checked.message);
        delivery = checked.details;
      }

      const split = splitOrderByServicePoint(lines, servicePoints, currency);
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
      // D-071 : les frais de livraison sont une facture à part, sans point de
      // service ni lignes ; rien à préparer. Pas de facture pour une zone gratuite.
      const fee = delivery?.zone.fee ?? null;
      const feeInvoice: AdvanceInvoice | null =
        fee && fee.amountMinor > 0
          ? {
              id: uuidv7(new Date(createdAt).getTime()),
              establishmentId: ctx.establishmentId,
              orderId,
              servicePointId: null,
              number: await nextNumber(db, "FAC", createdAt, ctx),
              mode: input.mode,
              tableLabel: null,
              waiterId: ctx.userId,
              waiterName: ctx.userName,
              deviceCode: ctx.deviceCode,
              createdAt,
              lines: [],
              total: fee,
              prepStatus: "served",
              paymentStatus: "unpaid",
            }
          : null;
      if (feeInvoice) invoices.push(feeInvoice);

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
        total: fee ? addMoney(linesTotal(lines, currency), fee) : linesTotal(lines, currency),
        invoiceIds: invoices.map((invoice) => invoice.id),
      };

      const deliveryRecord: Delivery | null = delivery
        ? {
            id: uuidv7(new Date(createdAt).getTime()),
            establishmentId: ctx.establishmentId,
            orderId,
            orderNumber,
            customerName: delivery.customerName,
            phone: delivery.phone,
            address: delivery.address,
            zoneId: delivery.zone.id,
            zoneName: delivery.zone.name,
            fee: delivery.zone.fee,
            feeInvoiceId: feeInvoice?.id ?? null,
            desiredTime: delivery.desiredTime,
            courierId: null,
            courierName: "",
            status: "preparing",
            events: [
              {
                id: uuidv7(new Date(createdAt).getTime()),
                kind: "preparing",
                at: createdAt,
                by: ctx.userId,
                byName: ctx.userName,
                note: null,
              },
            ],
            createdAt,
            createdBy: ctx.userId,
          }
        : null;

      await db.orders.add(order);
      await db.invoices.bulkAdd(invoices);
      if (deliveryRecord) await db.deliveries.add(deliveryRecord);
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
              invoices: invoices.flatMap((invoice) =>
                invoice.servicePointId === null
                  ? []
                  : [
                      {
                        id: invoice.id,
                        number: invoice.number,
                        servicePointId: invoice.servicePointId,
                      },
                    ],
              ),
              ...(deliveryRecord && delivery
                ? {
                    delivery: {
                      id: deliveryRecord.id,
                      // Zone gratuite : pas de facture de frais.
                      feeInvoice: feeInvoice
                        ? { id: feeInvoice.id, number: feeInvoice.number }
                        : null,
                      customerName: delivery.customerName,
                      phone: delivery.phone,
                      address: delivery.address,
                      zoneId: delivery.zone.id,
                      desiredTime: delivery.desiredTime,
                    },
                  }
                : {}),
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
  await db.transaction("rw", db.invoices, db.staff, db.outbox, async () => {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) throw new DomainError("INVOICE_NOT_FOUND", "Cette facture est introuvable.");
    // Les frais de livraison (D-071) ne se préparent pas.
    if (invoice.servicePointId === null) {
      throw new DomainError("NOT_PREPARED", "Les frais de livraison ne se préparent pas.");
    }
    if (ctx.role === "prep") {
      const own = (await db.staff.get(ctx.userId))?.servicePointId ?? null;
      if (!canWorkStation(ctx.role, own, invoice.servicePointId)) {
        throw new DomainError("NOT_YOUR_STATION", "Cette commande est pour un autre poste.");
      }
    }
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

/**
 * EF-PRE-03 : le poste déclare un élément épuisé pour la journée (il
 * disparaît aussitôt de la prise de commande), ou le remet en vente. Un
 * préparateur ne le fait que pour son poste ; le gérant pour tous.
 */
export async function setItemSoldOut(
  db: RestaurantDb,
  ctx: DeviceContext,
  itemId: string,
  isSoldOut: boolean,
  at: string = new Date().toISOString(),
): Promise<MenuItem> {
  assertPermission(ctx, "restaurant.menu.sold-out", "déclarer un élément épuisé");
  const { businessDayStartHour, timeZone } = ctx.settings;
  const day = businessDayKey(at, businessDayStartHour, timeZone);
  return db.transaction("rw", db.menuItems, db.staff, db.outbox, async () => {
    const item = await db.menuItems.get(itemId);
    if (!item || item.archivedAt !== null) {
      throw new DomainError("ITEM_NOT_FOUND", "Cet élément n'existe plus au menu.");
    }
    const own = (await db.staff.get(ctx.userId))?.servicePointId ?? null;
    if (!canWorkStation(ctx.role, own, item.servicePointId)) {
      throw new DomainError("NOT_YOUR_STATION", "Cet élément dépend d'un autre poste.");
    }
    const updated: MenuItem = { ...item, soldOutDay: isSoldOut ? day : null };
    await db.menuItems.put(updated);
    await db.outbox.add(
      createOperation({
        id: uuidv7(),
        type: "restaurant.menu-item.sold-out-set",
        payload: { itemId, day, isSoldOut } satisfies z.infer<typeof menuItemSoldOutSetSchema>,
        establishmentId: ctx.establishmentId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        createdAt: at,
      }),
    );
    return updated;
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
    const isFormulaItem = input.kind === "formula";
    if (isFormulaItem) {
      // D-060 : une formule a son prix et au moins deux éléments du menu.
      if (input.priceMajor === null) {
        throw new DomainError("PRICE_NOT_SET", "Fixez le prix de la formule.");
      }
      const itemById = new Map((await db.menuItems.toArray()).map((entry) => [entry.id, entry]));
      const issue = formulaIssue(input.components ?? [], itemById);
      if (issue) throw new DomainError(issue.code, issue.message);
    }
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
      ...(isFormulaItem ? { kind: "formula" as const, components: input.components ?? [] } : {}),
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

/**
 * Fixe les groupes d'options d'un élément (D-035, D-060) : ils remplacent les
 * précédents ; les commandes passées gardent les options figées sur leurs lignes.
 */
export async function setMenuItemOptions(
  db: RestaurantDb,
  ctx: DeviceContext,
  itemId: string,
  optionGroups: OptionGroup[],
): Promise<MenuItem> {
  assertPermission(ctx, "restaurant.menu.manage", "modifier le menu");
  const groups = optionGroups.map((group) => ({
    ...group,
    name: group.name.trim(),
    options: group.options.map((option) => ({ ...option, name: option.name.trim() })),
  }));
  const issue = optionGroupsIssue(groups);
  if (issue) throw new DomainError(issue.code, issue.message);
  const createdAt = new Date().toISOString();
  return db.transaction("rw", db.menuItems, db.outbox, async () => {
    const item = await db.menuItems.get(itemId);
    if (!item || item.archivedAt !== null) {
      throw new DomainError("ITEM_NOT_FOUND", "Cet élément n'existe plus au menu.");
    }
    if (item.kind === "formula") {
      throw new DomainError("FORMULA_OPTIONS", "Une formule ne porte pas d'options.");
    }
    const updated: MenuItem = { ...item, optionGroups: groups };
    await db.menuItems.put(updated);
    await db.outbox.add(
      createOperation({
        id: uuidv7(),
        type: "restaurant.menu-item.options-set",
        payload: { itemId, optionGroups: groups } satisfies z.infer<
          typeof menuItemOptionsSetSchema
        >,
        establishmentId: ctx.establishmentId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        createdAt,
      }),
    );
    return updated;
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
  const day = businessDayKey(dayStartIso, businessDayStartHour, timeZone);
  const [previousMorning, previousSold, items, previousCounts, requisitions] = await Promise.all([
    currentMorningStock(db, previousDay),
    soldQuantitiesBetween(db, previousStart, dayStartIso),
    db.menuItems.toArray(),
    db.stockCounts.where("day").equals(previousDay).toArray(),
    db.requisitions.where("day").equals(day).toArray(),
  ]);
  const requisitioned = morningRequisitioned(requisitions, day);
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
        // EF-REQ-04 : réquisitions principales du jour (D-069).
        requisitioned: requisitioned.get(item.id) ?? null,
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
    // stockCounts : la proposition part du stock compté à la clôture de la veille ;
    // requisitions : elle y ajoute les réquisitions principales du jour.
    [
      db.servicePoints,
      db.menuItems,
      db.invoices,
      db.morningStockEntries,
      db.stockCounts,
      db.requisitions,
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

export type RequisitionInput = {
  servicePointId: string;
  /** Retour au magasin (correction, surplus) plutôt que sortie. */
  isReturn: boolean;
  lines: readonly { menuItemId: string; quantity: number }[];
  comment: string;
};

/**
 * Établit et valide une réquisition (EF-REQ-02, RG-REQ-01, D-069 ; gérant) :
 * sortie du magasin vers un point de service, ou retour au magasin. Les
 * lignes à zéro sont ignorées ; noms et unités sont relus depuis le menu.
 * Principale ou complément selon que le stock du matin du point est déjà
 * saisi. Une réquisition ne se modifie plus : une erreur se corrige par un
 * retour au magasin.
 */
export async function createRequisition(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: RequisitionInput,
  options: { createdAt?: string; enqueue?: boolean } = {},
): Promise<Requisition> {
  assertPermission(ctx, "restaurant.requisition.create", "faire une réquisition");
  const createdAt = options.createdAt ?? new Date().toISOString();
  return db.transaction(
    "rw",
    [
      db.servicePoints,
      db.menuItems,
      db.morningStockEntries,
      db.dayClosings,
      db.requisitions,
      db.counters,
      db.outbox,
    ],
    async () => {
      const point = await db.servicePoints.get(input.servicePointId);
      if (!point) {
        throw new DomainError("SERVICE_POINT_NOT_FOUND", "Ce point de service n'existe pas.");
      }
      const items = itemsRequiringMorningStock(await db.menuItems.toArray(), point.id);
      const itemsById = new Map(items.map((item) => [item.id, item]));
      const lines = input.lines.filter((line) => line.quantity !== 0);
      const comment = input.comment.trim() === "" ? null : input.comment.trim();
      const issue = validateRequisition({
        isReturn: input.isReturn,
        lines,
        comment,
        allowedItems: itemsById,
      })[0];
      if (issue) throw new DomainError(issue.code, issue.message);

      const { businessDayStartHour, timeZone } = ctx.settings;
      const day = currentDayKey(createdAt, await validatedDays(db), businessDayStartHour, timeZone);
      const entries = await db.morningStockEntries.where("day").equals(day).toArray();
      const kind = requisitionKind({
        isReturn: input.isReturn,
        createdAt,
        morningEnteredAt: firstMorningEntryAt(entries, point.id, day),
      });
      const requisition: Requisition = {
        id: uuidv7(new Date(createdAt).getTime()),
        establishmentId: ctx.establishmentId,
        number: await nextNumber(db, "REQ", createdAt, ctx),
        day,
        servicePointId: point.id,
        kind,
        lines: lines.map((line) => {
          const item = itemsById.get(line.menuItemId);
          return {
            menuItemId: line.menuItemId,
            name: item?.name ?? "",
            unit: item?.unit ?? "bottle",
            quantity: line.quantity,
          };
        }),
        comment,
        createdAt,
        createdBy: ctx.userId,
        createdByName: ctx.userName,
      };
      await db.requisitions.add(requisition);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "restaurant.requisition.created",
            {
              requisition: {
                id: requisition.id,
                number: requisition.number,
                day,
                servicePointId: point.id,
                kind,
                lines: lines.map((line) => ({
                  menuItemId: line.menuItemId,
                  quantity: line.quantity,
                })),
                comment,
                createdAt,
              },
            } satisfies RequisitionCreatedPayload,
            createdAt,
          ),
        );
      }
      return requisition;
    },
  );
}

// ─── Livraison (EF-LIV-01 à 04, D-070, D-071) ───────────────────────────────

export type DeliveryZoneInput = { id?: string; name: string; feeMajor: number | null };

/** Crée ou modifie une zone de livraison et ses frais (EF-LIV-01 ; gérant). */
export async function saveDeliveryZone(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: DeliveryZoneInput,
  options: { at?: string; enqueue?: boolean } = {},
): Promise<DeliveryZone> {
  assertPermission(ctx, "delivery.manage", "gérer les zones de livraison");
  const at = options.at ?? new Date().toISOString();
  return db.transaction("rw", [db.deliveryZones, db.outbox], async () => {
    const zones = await db.deliveryZones.toArray();
    const issue = zoneIssue(input, zones, input.id);
    if (issue) throw new DomainError(issue.code, issue.message);
    const current = input.id ? zones.find((zone) => zone.id === input.id) : undefined;
    if (input.id && !current) {
      throw new DomainError("ZONE_NOT_FOUND", "Cette zone n'existe plus.");
    }
    const zone: DeliveryZone = {
      id: current?.id ?? uuidv7(new Date(at).getTime()),
      establishmentId: ctx.establishmentId,
      name: input.name.trim(),
      fee: zoneFee(input.feeMajor ?? 0, ctx.settings.currency),
      sortOrder:
        current?.sortOrder ?? zones.reduce((max, zone) => Math.max(max, zone.sortOrder), 0) + 1,
      createdAt: current?.createdAt ?? at,
      archivedAt: current?.archivedAt ?? null,
    };
    await db.deliveryZones.put(zone);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "delivery.zone.saved",
          {
            zone: {
              id: zone.id,
              name: zone.name,
              feeMajor: input.feeMajor ?? 0,
              sortOrder: zone.sortOrder,
            },
          } satisfies DeliveryZoneSavedPayload,
          at,
        ),
      );
    }
    return zone;
  });
}

/** Retire une zone du service, ou l'y remet (EF-LIV-01 ; gérant). */
export async function setDeliveryZoneArchived(
  db: RestaurantDb,
  ctx: DeviceContext,
  zoneId: string,
  isArchived: boolean,
  options: { at?: string; enqueue?: boolean } = {},
): Promise<void> {
  assertPermission(ctx, "delivery.manage", "gérer les zones de livraison");
  const at = options.at ?? new Date().toISOString();
  await db.transaction("rw", [db.deliveryZones, db.outbox], async () => {
    const zones = await db.deliveryZones.toArray();
    const zone = zones.find((entry) => entry.id === zoneId);
    if (!zone) throw new DomainError("ZONE_NOT_FOUND", "Cette zone n'existe plus.");
    if (!isArchived) {
      const issue = zoneIssue({ name: zone.name, feeMajor: 0 }, zones, zone.id);
      if (issue?.code === "ZONE_NAME_TAKEN") throw new DomainError(issue.code, issue.message);
    }
    await db.deliveryZones.update(zoneId, { archivedAt: isArchived ? at : null });
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "delivery.zone.archived",
          { zoneId, isArchived } satisfies DeliveryZoneArchivedPayload,
          at,
        ),
      );
    }
  });
}

/** EF-LIV-02 : le gérant attribue la livraison à un livreur du personnel. */
export async function assignDelivery(
  db: RestaurantDb,
  ctx: DeviceContext,
  deliveryId: string,
  courierId: string,
  options: { at?: string; enqueue?: boolean } = {},
): Promise<Delivery> {
  assertPermission(ctx, "delivery.manage", "attribuer une livraison");
  const at = options.at ?? new Date().toISOString();
  return db.transaction("rw", [db.deliveries, db.staff, db.outbox], async () => {
    const delivery = await db.deliveries.get(deliveryId);
    if (!delivery) throw new DomainError("DELIVERY_NOT_FOUND", "Cette livraison est introuvable.");
    const courier = await db.staff.get(courierId);
    const issue = courierIssue(delivery, courier);
    if (issue) throw new DomainError(issue.code, issue.message);
    const eventId = uuidv7(new Date(at).getTime());
    const updated: Delivery = {
      ...delivery,
      courierId,
      courierName: courier?.name ?? "",
      events: [
        ...delivery.events,
        {
          id: eventId,
          kind: "assigned",
          at,
          by: ctx.userId,
          byName: ctx.userName,
          courierId,
          note: null,
        },
      ],
    };
    await db.deliveries.put(updated);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "delivery.assigned",
          { deliveryId, eventId, courierId, at } satisfies DeliveryAssignedPayload,
          at,
        ),
      );
    }
    return updated;
  });
}

/**
 * EF-LIV-03, EF-LIV-04 : en route, livrée, ou échouée avec un motif. Le
 * livreur fait avancer les siennes, le gérant toutes.
 */
export async function setDeliveryStatus(
  db: RestaurantDb,
  ctx: DeviceContext,
  deliveryId: string,
  status: Exclude<DeliveryStatus, "preparing">,
  note: string | null = null,
  options: { at?: string; enqueue?: boolean } = {},
): Promise<Delivery> {
  assertPermission(ctx, "delivery.update", "suivre une livraison");
  const at = options.at ?? new Date().toISOString();
  return db.transaction("rw", [db.deliveries, db.outbox], async () => {
    const delivery = await db.deliveries.get(deliveryId);
    if (!delivery) throw new DomainError("DELIVERY_NOT_FOUND", "Cette livraison est introuvable.");
    const cleanNote = note?.trim() ? note.trim() : null;
    const issue = statusIssue({
      delivery,
      next: status,
      role: ctx.role,
      userId: ctx.userId,
      note: cleanNote,
    });
    if (issue) throw new DomainError(issue.code, issue.message);
    const eventId = uuidv7(new Date(at).getTime());
    const updated: Delivery = {
      ...delivery,
      status,
      events: [
        ...delivery.events,
        { id: eventId, kind: status, at, by: ctx.userId, byName: ctx.userName, note: cleanNote },
      ],
    };
    await db.deliveries.put(updated);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "delivery.status-changed",
          {
            deliveryId,
            eventId,
            status,
            note: cleanNote,
            at,
          } satisfies DeliveryStatusChangedPayload,
          at,
        ),
      );
    }
    return updated;
  });
}

/**
 * RG-LIV-01 : le gérant règle une livraison échouée. La commande est annulée
 * (frais compris) ; les plats rapportés reviennent en stock s'ils sont
 * réutilisables, sinon ils sont comptés en perte.
 */
export async function settleFailedDelivery(
  db: RestaurantDb,
  ctx: DeviceContext,
  deliveryId: string,
  outcome: DeliveryOutcome,
  options: { at?: string; enqueue?: boolean } = {},
): Promise<Delivery> {
  assertPermission(ctx, "delivery.manage", "régler une livraison échouée");
  const at = options.at ?? new Date().toISOString();
  return db.transaction(
    "rw",
    [db.deliveries, db.orders, db.invoices, db.payments, db.dayClosings, db.outbox],
    async () => {
      const delivery = await db.deliveries.get(deliveryId);
      if (!delivery) {
        throw new DomainError("DELIVERY_NOT_FOUND", "Cette livraison est introuvable.");
      }
      const order = await db.orders.get(delivery.orderId);
      const { invoices, balances } = await orderBalances(db, delivery.orderId);
      const hasPayment = invoices.some(
        (invoice) => (balances.get(invoice.id)?.paid.amountMinor ?? 0) > 0,
      );
      const issue = failureSettlementIssue({
        delivery,
        hasPayment,
        isDayValidated: order ? await isOrderDayValidated(db, ctx, order) : false,
      });
      if (issue) throw new DomainError(issue.code, issue.message);

      const failure = [...delivery.events].reverse().find((event) => event.kind === "failed");
      const reason = `Livraison échouée${failure?.note ? ` : ${failure.note}` : ""}`;
      for (const invoice of invoices) {
        await db.invoices.update(invoice.id, { paymentStatus: "cancelled", cancelReason: reason });
      }
      const eventId = uuidv7(new Date(at).getTime());
      const updated: Delivery = {
        ...delivery,
        failureOutcome: outcome,
        events: [
          ...delivery.events,
          {
            id: eventId,
            kind: "settled",
            at,
            by: ctx.userId,
            byName: ctx.userName,
            note: DELIVERY_OUTCOME_LABELS[outcome],
          },
        ],
      };
      await db.deliveries.put(updated);
      if (options.enqueue !== false) {
        await db.outbox.add(
          tableOperation(
            ctx,
            "delivery.failure-settled",
            { deliveryId, eventId, outcome, at } satisfies DeliveryFailureSettledPayload,
            at,
          ),
        );
      }
      return updated;
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

  return db.transaction(
    "rw",
    [db.invoices, db.payments, db.exchangeRates, db.deliveries, db.outbox],
    async () => {
      const found = await db.invoices.bulkGet(input.invoiceIds);
      const invoices: AdvanceInvoice[] = [];
      for (const invoice of found) {
        if (!invoice) {
          throw new DomainError("INVOICE_NOT_FOUND", "Une facture à encaisser est introuvable.");
        }
        if (invoice.paymentStatus === "cancelled") {
          throw new DomainError("INVOICE_CANCELLED", `La facture ${invoice.number} est annulée.`);
        }
        // Matrice des droits : un serveur encaisse ses ventes, un livreur ses
        // livraisons (D-070), le gérant tout.
        const delivery =
          ctx.role === "courier"
            ? await db.deliveries.where("orderId").equals(invoice.orderId).first()
            : undefined;
        if (
          !canCollectFor({
            role: ctx.role,
            userId: ctx.userId,
            waiterId: invoice.waiterId,
            delivery,
          })
        ) {
          throw new DomainError(
            "FORBIDDEN",
            ctx.role === "courier"
              ? `La facture ${invoice.number} ne fait pas partie de vos livraisons.`
              : `La facture ${invoice.number} appartient à ${invoice.waiterName} : seul ce serveur ou un gérant peut l'encaisser.`,
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
    },
  );
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
  const [items, morning, sold, requisitions, dayInvoices, deliveries] = await Promise.all([
    db.menuItems.toArray(),
    currentMorningStock(db, day),
    soldQuantitiesBetween(db, dayStart, nextDayIso(dayStart)),
    db.requisitions.where("day").equals(day).toArray(),
    db.invoices.where("createdAt").between(dayStart, nextDayIso(dayStart), true, false).toArray(),
    db.deliveries.where("createdAt").aboveOrEqual(dayStart).toArray(),
  ]);
  // RG-LIV-01 : plats perdus d'une livraison échouée.
  const lost = lostQuantities(deliveries, dayInvoices);
  // Compléments moins retours (D-069) : les principales sont déjà dans le matin.
  const later = laterRequisitioned(requisitions, day);
  return itemsRequiringMorningStock(items, servicePointId).map((item) => ({
    menuItemId: item.id,
    name: item.name,
    unit: item.unit,
    morning: morning.get(item.id)?.quantity ?? null,
    requisitioned: later.get(item.id) ?? 0,
    sold: sold.get(item.id) ?? 0,
    lost: lost.get(item.id) ?? 0,
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
      db.requisitions,
      db.deliveries,
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

/**
 * RG-CLO-02 : la commande appartient-elle à une journée validée ? Seulement
 * si elle est antérieure à la validation : ce qui suit appartient à la
 * journée suivante (D-039).
 */
async function isOrderDayValidated(
  db: RestaurantDb,
  ctx: DeviceContext,
  order: Pick<Order, "createdAt">,
): Promise<boolean> {
  const { businessDayStartHour, timeZone } = ctx.settings;
  const day = businessDayKey(order.createdAt, businessDayStartHour, timeZone);
  const closings = await db.dayClosings.where("day").equals(day).toArray();
  return closings.some((closing) => order.createdAt <= closing.validatedAt);
}

export type AdjustmentInput = {
  kind: AdjustmentKind;
  orderId: string;
  reason: string;
  /** Remise demandée, en unité principale ; ignorée pour une annulation. */
  discountMajor?: number | null;
  /** Vente à crédit (D-059) : client débiteur. */
  customerId?: string | null;
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
      db.customers,
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
        ...(input.kind === "credit"
          ? { credit: await creditState(db, ctx, input.customerId ?? null, invoices) }
          : {}),
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
        customerId: input.kind === "credit" ? (input.customerId ?? null) : null,
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
                customerId: created.customerId,
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
      db.customers,
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
          ...(request.kind === "credit"
            ? { credit: await creditState(db, ctx, request.customerId, targets) }
            : {}),
        });
        if (issue) throw new DomainError(issue.code, issue.message);
        if (request.kind === "cancel") {
          for (const invoice of targets) {
            await db.invoices.update(invoice.id, {
              paymentStatus: "cancelled",
              cancelReason: request.reason,
            });
          }
        } else if (request.kind === "credit") {
          // D-059 : le reste à payer devient la dette du client ; la facture n'est
          // plus un impayé du serveur (RG-ENC-02).
          for (const invoice of targets) {
            const remaining = balances.get(invoice.id)?.remaining;
            if (!remaining || remaining.amountMinor <= 0) continue;
            await db.invoices.update(invoice.id, {
              creditRequestId: request.id,
              credited: remaining,
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

// ─── Fiches clients et vente à crédit (D-059) ───────────────────────────────

/**
 * Contrôles de la vente à crédit (EF-ENC-03, D-037) : client connu, commande
 * pas encore à crédit, encours du client sous son plafond.
 */
async function creditState(
  db: RestaurantDb,
  ctx: DeviceContext,
  customerId: string | null,
  invoices: readonly AdvanceInvoice[],
) {
  const currency = ctx.settings.currency;
  const customer = customerId ? await db.customers.get(customerId) : undefined;
  const credits = customer
    ? (await db.adjustmentRequests.toArray()).filter(
        (request) => request.kind === "credit" && request.customerId === customer.id,
      )
    : [];
  const decisions = await db.adjustmentDecisions.toArray();
  const debtInvoices = credits.length
    ? await db.invoices
        .where("orderId")
        .anyOf(credits.map((request) => request.orderId))
        .toArray()
    : [];
  const since = debtInvoices.map((invoice) => invoice.createdAt).sort()[0];
  const payments = since ? await db.payments.where("createdAt").aboveOrEqual(since).toArray() : [];
  const debts = customerDebts({
    requests: credits,
    decisions,
    invoices: debtInvoices,
    balances: invoiceBalances(debtInvoices, payments),
    currency,
  });
  return {
    hasCustomer: customer !== undefined,
    isAlreadyCredited: invoices.some((invoice) => Boolean(invoice.creditRequestId)),
    creditLimit: customer?.creditLimit ?? null,
    outstanding: customer ? outstandingOf(customer.id, debts, currency) : zeroMoney(currency),
  };
}

/** Crée la fiche d'un client pour une vente à crédit (EF-ENC-03 : nom et téléphone). */
export async function createCustomer(
  db: RestaurantDb,
  ctx: DeviceContext,
  input: { name: string; phone: string },
  options: { createdAt?: string; enqueue?: boolean } = {},
): Promise<Customer> {
  assertPermission(ctx, "restaurant.customer.create", "créer une fiche client");
  const createdAt = options.createdAt ?? new Date().toISOString();
  return db.transaction("rw", db.customers, db.outbox, async () => {
    const issue = customerIssue(input, await db.customers.toArray());
    if (issue) throw new DomainError(issue.code, issue.message);
    const customer: Customer = {
      id: uuidv7(new Date(createdAt).getTime()),
      establishmentId: ctx.establishmentId,
      name: input.name.trim(),
      phone: normalizePhone(input.phone) ?? input.phone.trim(),
      creditLimit: null,
      createdAt,
      createdBy: ctx.userId,
    };
    await db.customers.add(customer);
    if (options.enqueue !== false) {
      await db.outbox.add(
        tableOperation(
          ctx,
          "restaurant.customer.created",
          {
            customer: {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              createdAt,
            },
          } satisfies CustomerCreatedPayload,
          createdAt,
        ),
      );
    }
    return customer;
  });
}

/** Fixe ou retire le plafond de crédit d'un client (D-037 ; gérant). */
export async function setCustomerCreditLimit(
  db: RestaurantDb,
  ctx: DeviceContext,
  customerId: string,
  limitMajor: number | null,
): Promise<void> {
  assertPermission(ctx, "restaurant.customer.manage", "fixer un plafond de crédit");
  if (limitMajor !== null && (!Number.isFinite(limitMajor) || limitMajor <= 0)) {
    throw new DomainError("INVALID_LIMIT", "Le plafond doit être un montant positif.");
  }
  const at = new Date().toISOString();
  await db.transaction("rw", db.customers, db.outbox, async () => {
    const customer = await db.customers.get(customerId);
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Ce client est introuvable.");
    const creditLimit =
      limitMajor === null ? null : moneyFromMajor(limitMajor, ctx.settings.currency);
    await db.customers.update(customerId, { creditLimit });
    await db.outbox.add(
      tableOperation(
        ctx,
        "restaurant.customer.limit-set",
        {
          customerId,
          creditLimitMinor: creditLimit?.amountMinor ?? null,
        } satisfies CustomerLimitSetPayload,
        at,
      ),
    );
  });
}
