import type { z } from "zod";

import { DomainError } from "@/shared/lib/errors";
import { formatMoney, moneyFromMinor, type Currency } from "@/shared/lib/money";

import {
  ADJUSTMENT_LABELS,
  MIN_REASON_LENGTH as MIN_ADJUSTMENT_REASON,
  adjustmentIssue,
  splitDiscount,
} from "@/modules/restaurant/domain/adjustment";
import {
  businessDayKey,
  businessDayStartOf,
  DEFAULT_BUSINESS_DAY_START_HOUR,
} from "@/modules/restaurant/domain/business-day";
import {
  collectedByServicePoint,
  collectorsWithUnclosedPayments,
  dayClosingIssues,
  expectedCashLines,
  latestStockCounts,
  stockLineVariance,
  unpaidInvoiceIds,
  validateCashClosing,
  validateStockCount,
} from "@/modules/restaurant/domain/closing";
import { customerIssue, normalizePhone } from "@/modules/restaurant/domain/customers";
import {
  expandOrderLine,
  formulaIssue,
  optionGroupsIssue,
} from "@/modules/restaurant/domain/menu-options";
import { canWorkStation } from "@/modules/restaurant/domain/preparation";
import {
  currentEntries,
  isMorningStockComplete,
  itemsRequiringMorningStock,
} from "@/modules/restaurant/domain/morning-stock";
import { splitOrderByServicePoint } from "@/modules/restaurant/domain/order";
import {
  REQUISITION_KIND_LABELS,
  laterRequisitioned,
  requisitionKind,
  validateRequisition,
} from "@/modules/restaurant/domain/requisition";
import {
  checkPaymentConsistency,
  convertMoney,
  invoiceBalances,
  parseRate,
} from "@/modules/restaurant/domain/payment";
import { validateTableLabel } from "@/modules/restaurant/domain/tables";
import type {
  AdjustmentKind,
  CashClosingLine,
  OptionGroup,
  OrderLine,
  PaymentAllocation,
  StockCountLine,
} from "@/modules/restaurant/domain/types";
import type { Permission } from "@/modules/registry";
import {
  adjustmentDecidedSchema,
  adjustmentRequestedSchema,
  cashClosingDeclaredSchema,
  customerCreatedSchema,
  customerLimitSetSchema,
  dayValidatedSchema,
  exchangeRateAddedSchema,
  menuItemCreatedSchema,
  morningStockEnteredSchema,
  orderCreatedSchema,
  menuItemOptionsSetSchema,
  menuItemSoldOutSetSchema,
  paymentRecordedSchema,
  prepStatusChangedSchema,
  requisitionCreatedSchema,
  stockCountedSchema,
  tableArchivedSchema,
  tableCreatedSchema,
  tableReleasedSchema,
  tableRenamedSchema,
} from "@/modules/restaurant/schemas/sync";

import { writeAudit } from "../audit/audit";
import {
  adjustmentDecisionSnapshots,
  adjustmentRequestSnapshots,
  cashClosingSnapshots,
  customerSnapshot,
  dayClosingSnapshots,
  diningTableSnapshot,
  exchangeRateSnapshots,
  jsonArray,
  menuItemSnapshot,
  morningEntrySnapshots,
  orderSnapshots,
  paymentSnapshots,
  rateText,
  requisitionSnapshots,
  stockCountSnapshots,
  tableReleaseSnapshots,
} from "../restaurant/snapshots";
import type { Tx } from "../db/context";
import { toJson, toSafeNumber } from "../db/context";

export type HandlerContext = {
  establishmentId: string;
  deviceId: string;
  deviceCode: string;
  userId: string;
  role: string;
  currency: Currency;
  timeZone: string;
  receivedAt: Date;
};

export type OperationHandler<S extends z.ZodType = z.ZodType> = {
  permission: Permission;
  schema: S;
  apply: (tx: Tx, ctx: HandlerContext, payload: z.infer<S>) => Promise<void>;
};

function handler<S extends z.ZodType>(definition: OperationHandler<S>): OperationHandler {
  return definition as unknown as OperationHandler;
}

/** Journal des changements diffusés aux autres appareils (GET /api/sync/pull). */
async function recordChange(
  tx: Tx,
  ctx: HandlerContext,
  entity: string,
  entityId: string,
  data: unknown,
): Promise<void> {
  await tx.changeLog.create({
    data: { establishmentId: ctx.establishmentId, entity, entityId, data: toJson(data) },
  });
}

function assertDeviceNumber(number: string, ctx: HandlerContext): void {
  // EF-DOC-01 : le code appareil du numéro doit être celui de l'appareil émetteur.
  if (!number.includes(`-${ctx.deviceCode}-`)) {
    throw new DomainError(
      "NUMBER_DEVICE_MISMATCH",
      `Le numéro ${number} n'appartient pas à l'appareil ${ctx.deviceCode}.`,
    );
  }
}

const orderCreated = handler({
  permission: "restaurant.order.create",
  schema: orderCreatedSchema,
  async apply(tx, ctx, payload) {
    assertDeviceNumber(payload.number, ctx);
    payload.invoices.forEach((invoice) => assertDeviceNumber(invoice.number, ctx));

    const [items, servicePoints] = await Promise.all([
      // Tout le menu : une formule se déplie en ses composants (D-060).
      tx.menuItem.findMany({ where: { establishmentId: ctx.establishmentId } }),
      tx.servicePoint.findMany({
        where: { establishmentId: ctx.establishmentId },
        select: { id: true, sortOrder: true },
      }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, menuItemSnapshot(item)]));

    // Prix relus côté serveur (CLAUDE.md § 3.9, RG-RES-02) : le serveur fait foi,
    // options et parts de formule comprises (D-060).
    const lines: OrderLine[] = payload.lines.flatMap((line, index) => {
      const expanded = expandOrderLine(line, itemById, `${payload.orderId}:${index}`, {
        lenient: true,
      });
      if (!expanded.ok) {
        throw new DomainError(
          expanded.code,
          expanded.code === "ITEM_NOT_FOUND"
            ? "Un élément commandé est inconnu du serveur."
            : expanded.message,
        );
      }
      return expanded.lines;
    });

    let tableLabel: string | null = null;
    if (payload.tableId) {
      const table = await tx.diningTable.findFirst({
        where: { id: payload.tableId, establishmentId: ctx.establishmentId },
      });
      if (!table) throw new DomainError("TABLE_NOT_FOUND", "La table de la commande est inconnue.");
      tableLabel = table.label;
    }

    // EF-CMD-02 : la répartition du serveur doit correspondre aux factures de l'appareil.
    const split = splitOrderByServicePoint(lines, servicePoints, ctx.currency);
    const devicePoints = payload.invoices.map((invoice) => invoice.servicePointId).sort();
    const serverPoints = split.map((group) => group.servicePointId).sort();
    if (devicePoints.join() !== serverPoints.join()) {
      throw new DomainError(
        "SPLIT_MISMATCH",
        "La répartition par point de service ne correspond pas au menu du serveur.",
      );
    }

    // RG-STK-03 : pas de blocage sur le stock à la synchronisation.
    const createdAt = new Date(payload.createdAt);
    const total = split.reduce((sum, group) => sum + group.total.amountMinor, 0);
    await tx.order.create({
      data: {
        id: payload.orderId,
        establishmentId: ctx.establishmentId,
        number: payload.number,
        mode: payload.mode,
        tableId: payload.tableId,
        tableLabel,
        waiterId: ctx.userId,
        deviceId: ctx.deviceId,
        totalMinor: BigInt(total),
        currency: ctx.currency,
        createdAt,
      },
    });
    for (const group of split) {
      const invoice = payload.invoices.find(
        (entry) => entry.servicePointId === group.servicePointId,
      );
      if (!invoice) continue;
      await tx.advanceInvoice.create({
        data: {
          id: invoice.id,
          establishmentId: ctx.establishmentId,
          orderId: payload.orderId,
          servicePointId: group.servicePointId,
          number: invoice.number,
          totalMinor: BigInt(group.total.amountMinor),
          currency: ctx.currency,
          createdAt,
        },
      });
      await tx.invoiceLine.createMany({
        data: group.lines.map((line) => ({
          establishmentId: ctx.establishmentId,
          invoiceId: invoice.id,
          menuItemId: line.menuItemId,
          name: line.name,
          unit: line.unit,
          unitPriceMinor: BigInt(line.unitPrice.amountMinor),
          quantity: line.quantity,
          lineTotalMinor: BigInt(line.unitPrice.amountMinor * line.quantity),
          options: toJson(line.options ?? []),
          formulaItemId: line.formula?.menuItemId ?? null,
          formulaName: line.formula?.name ?? null,
          formulaLineId: line.formula?.lineId ?? null,
        })),
      });
    }
    // Diffusion aux autres appareils : enregistrements complets, prix du serveur.
    const snapshot = await orderSnapshots(tx, ctx.establishmentId, { id: payload.orderId });
    for (const invoice of snapshot.invoices) {
      await recordChange(tx, ctx, "advance_invoice", invoice.id, invoice);
    }
    for (const order of snapshot.orders) {
      await recordChange(tx, ctx, "order", order.id, order);
    }
  },
});

/**
 * Matrice des droits, « Postes de préparation » (D-066) : un préparateur ne
 * travaille que pour le point de service de son poste.
 */
async function assertOwnStation(tx: Tx, ctx: HandlerContext, servicePointId: string) {
  if (ctx.role !== "prep") return;
  const membership = await tx.membership.findFirst({
    where: { userId: ctx.userId, establishmentId: ctx.establishmentId },
    select: { servicePointId: true },
  });
  if (!canWorkStation(ctx.role, membership?.servicePointId ?? null, servicePointId)) {
    throw new DomainError("NOT_YOUR_STATION", "Cette action concerne un autre poste.");
  }
}

const prepStatusChanged = handler({
  permission: "restaurant.order.prep-status",
  schema: prepStatusChangedSchema,
  async apply(tx, ctx, payload) {
    const invoice = await tx.advanceInvoice.findFirst({
      where: { id: payload.invoiceId, establishmentId: ctx.establishmentId },
    });
    if (!invoice) throw new DomainError("INVOICE_NOT_FOUND", "Facture inconnue du serveur.");
    await assertOwnStation(tx, ctx, invoice.servicePointId);
    if (invoice.cancelledAt)
      throw new DomainError("INVOICE_CANCELLED", "Cette facture est annulée.");
    await tx.advanceInvoice.update({
      where: { id: invoice.id },
      data: { prepStatus: payload.status },
    });
    const snapshot = await orderSnapshots(tx, ctx.establishmentId, { id: invoice.orderId });
    const updated = snapshot.invoices.find((entry) => entry.id === invoice.id);
    if (updated) await recordChange(tx, ctx, "advance_invoice", invoice.id, updated);
  },
});

const menuItemCreated = handler({
  permission: "restaurant.menu.manage",
  schema: menuItemCreatedSchema,
  async apply(tx, ctx, { item }) {
    const point = await tx.servicePoint.findFirst({
      where: { id: item.servicePointId, establishmentId: ctx.establishmentId },
    });
    if (!point) throw new DomainError("SERVICE_POINT_NOT_FOUND", "Point de service inconnu.");
    if (item.price && item.price.currency !== ctx.currency) {
      throw new DomainError(
        "CURRENCY_MISMATCH",
        "Le prix doit être dans la devise de l'établissement.",
      );
    }
    const isFormulaItem = item.kind === "formula";
    if (isFormulaItem) {
      // D-060 : composants relus dans cet établissement (pas d'élément d'ailleurs).
      if (!item.price) throw new DomainError("PRICE_NOT_SET", "Une formule doit avoir un prix.");
      const menu = await tx.menuItem.findMany({ where: { establishmentId: ctx.establishmentId } });
      const issue = formulaIssue(
        item.components ?? [],
        new Map(menu.map((row) => [row.id, menuItemSnapshot(row)])),
      );
      if (issue) throw new DomainError(issue.code, issue.message);
    }
    const optionGroups = isFormulaItem ? [] : (item.optionGroups ?? []);
    assertOptionGroups(optionGroups, ctx.currency);
    const created = await tx.menuItem.create({
      data: {
        id: item.id,
        establishmentId: ctx.establishmentId,
        servicePointId: item.servicePointId,
        name: item.name,
        description: item.description,
        category: item.category,
        unit: item.unit,
        priceMinor: item.price ? BigInt(item.price.amountMinor) : null,
        currency: ctx.currency,
        kind: isFormulaItem ? "formula" : "simple",
        components: toJson(isFormulaItem ? (item.components ?? []) : []),
        optionGroups: toJson(optionGroups),
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.menu-item.created",
      entity: "menu_item",
      entityId: item.id,
      after: item,
    });
    await recordChange(tx, ctx, "menu_item", item.id, menuItemSnapshot(created));
  },
});

function assertOptionGroups(groups: OptionGroup[], currency: Currency): void {
  const issue = optionGroupsIssue(groups);
  if (issue) throw new DomainError(issue.code, issue.message);
  const ids = groups.flatMap((group) => [group.id, ...group.options.map((option) => option.id)]);
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("DUPLICATE_OPTION", "Deux options portent le même identifiant.");
  }
  if (
    groups.some((group) => group.options.some((option) => option.priceDelta.currency !== currency))
  ) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      "Les suppléments doivent être dans la devise de l'établissement.",
    );
  }
}

/** EF-PRE-03 : élément épuisé pour une journée, ou remis en vente (D-066). */
const menuItemSoldOutSet = handler({
  permission: "restaurant.menu.sold-out",
  schema: menuItemSoldOutSetSchema,
  async apply(tx, ctx, payload) {
    const item = await tx.menuItem.findFirst({
      where: { id: payload.itemId, establishmentId: ctx.establishmentId },
    });
    if (!item) throw new DomainError("ITEM_NOT_FOUND", "Élément de menu inconnu du serveur.");
    await assertOwnStation(tx, ctx, item.servicePointId);
    const soldOutDay = payload.isSoldOut ? payload.day : null;
    // Remise en vente d'une autre journée : rien à défaire.
    if (!payload.isSoldOut && item.soldOutDay !== payload.day) return;
    const updated = await tx.menuItem.update({ where: { id: item.id }, data: { soldOutDay } });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.menu-item.sold-out-set",
      entity: "menu_item",
      entityId: item.id,
      before: { soldOutDay: item.soldOutDay },
      after: { soldOutDay, day: payload.day },
    });
    await recordChange(tx, ctx, "menu_item", item.id, menuItemSnapshot(updated));
  },
});

const menuItemOptionsSet = handler({
  permission: "restaurant.menu.manage",
  schema: menuItemOptionsSetSchema,
  async apply(tx, ctx, payload) {
    const item = await tx.menuItem.findFirst({
      where: { id: payload.itemId, establishmentId: ctx.establishmentId },
    });
    if (!item) throw new DomainError("ITEM_NOT_FOUND", "Élément de menu inconnu du serveur.");
    if (item.kind === "formula") {
      throw new DomainError("FORMULA_OPTIONS", "Une formule ne porte pas d'options.");
    }
    assertOptionGroups(payload.optionGroups, ctx.currency);
    const updated = await tx.menuItem.update({
      where: { id: item.id },
      data: { optionGroups: toJson(payload.optionGroups) },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.menu-item.options-set",
      entity: "menu_item",
      entityId: item.id,
      before: { optionGroups: jsonArray<OptionGroup>(item.optionGroups) },
      after: { optionGroups: payload.optionGroups },
    });
    await recordChange(tx, ctx, "menu_item", item.id, menuItemSnapshot(updated));
  },
});

const morningStockEntered = handler({
  permission: "restaurant.morning-stock.enter",
  schema: morningStockEnteredSchema,
  async apply(tx, ctx, payload) {
    const items = await tx.menuItem.findMany({
      where: { servicePointId: payload.servicePointId, establishmentId: ctx.establishmentId },
      select: { id: true },
    });
    const allowed = new Set(items.map((item) => item.id));
    for (const entry of payload.entries) {
      if (!allowed.has(entry.menuItemId)) {
        throw new DomainError(
          "ITEM_NOT_FOUND",
          "Un élément saisi n'appartient pas à ce point de service.",
        );
      }
      // RG-REQ-02 : motif obligatoire pour un écart ou une correction.
      const needsReason =
        entry.replacesId !== null || (entry.proposed !== null && entry.quantity !== entry.proposed);
      if (needsReason && (entry.reason ?? "").length < 3) {
        throw new DomainError("REASON_REQUIRED", "Un écart de stock du matin n'a pas de motif.");
      }
    }
    await tx.morningStockEntry.createMany({
      data: payload.entries.map((entry) => ({
        id: entry.id,
        establishmentId: ctx.establishmentId,
        day: payload.day,
        servicePointId: payload.servicePointId,
        menuItemId: entry.menuItemId,
        quantity: entry.quantity,
        proposed: entry.proposed,
        reason: entry.reason,
        replacesId: entry.replacesId,
        enteredAt: new Date(entry.enteredAt),
        enteredBy: ctx.userId,
      })),
    });
    const variances = payload.entries.filter(
      (entry) => entry.proposed !== null && entry.quantity !== entry.proposed,
    );
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.morning-stock.entered",
      entity: "service_point",
      entityId: payload.servicePointId,
      after: { day: payload.day, entries: payload.entries.length, variances },
    });
    const entries = await morningEntrySnapshots(tx, ctx.establishmentId, {
      id: { in: payload.entries.map((entry) => entry.id) },
    });
    for (const entry of entries) {
      await recordChange(tx, ctx, "morning_stock_entry", entry.id, entry);
    }
  },
});

/**
 * Réquisition (EF-REQ-02, RG-REQ-01, D-069 ; gérant). Le serveur relit les
 * éléments du point de service et recalcule le genre : une réquisition faite
 * hors connexion après un stock du matin saisi sur un autre appareil devient
 * un complément, pour ne pas manquer au stock attendu de la clôture.
 */
const requisitionCreated = handler({
  permission: "restaurant.requisition.create",
  schema: requisitionCreatedSchema,
  async apply(tx, ctx, { requisition }) {
    await assertDayOpen(tx, ctx, requisition.day);
    const point = await tx.servicePoint.findFirst({
      where: { id: requisition.servicePointId, establishmentId: ctx.establishmentId },
    });
    if (!point) throw new DomainError("SERVICE_POINT_NOT_FOUND", "Point de service inconnu.");
    const items = itemsRequiringMorningStock(
      (
        await tx.menuItem.findMany({
          where: { establishmentId: ctx.establishmentId, servicePointId: point.id },
        })
      ).map(menuItemSnapshot),
      point.id,
    );
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const isReturn = requisition.kind === "return";
    const issue = validateRequisition({
      isReturn,
      lines: requisition.lines,
      comment: requisition.comment,
      allowedItems: itemsById,
    })[0];
    if (issue) throw new DomainError(issue.code, issue.message);

    const firstMorning = await tx.morningStockEntry.findFirst({
      where: {
        establishmentId: ctx.establishmentId,
        servicePointId: point.id,
        day: requisition.day,
      },
      orderBy: { enteredAt: "asc" },
      select: { enteredAt: true },
    });
    const kind = requisitionKind({
      isReturn,
      createdAt: new Date(requisition.createdAt).toISOString(),
      morningEnteredAt: firstMorning?.enteredAt.toISOString() ?? null,
    });
    const lines = requisition.lines.map((line) => {
      const item = itemsById.get(line.menuItemId);
      return {
        menuItemId: line.menuItemId,
        name: item?.name ?? "",
        unit: item?.unit ?? "bottle",
        quantity: line.quantity,
      };
    });
    await tx.requisition.create({
      data: {
        id: requisition.id,
        establishmentId: ctx.establishmentId,
        number: requisition.number,
        day: requisition.day,
        servicePointId: point.id,
        kind,
        lines: toJson(lines),
        comment: requisition.comment,
        createdAt: new Date(requisition.createdAt),
        createdBy: ctx.userId,
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.requisition.created",
      entity: "requisition",
      entityId: requisition.id,
      after: {
        number: requisition.number,
        day: requisition.day,
        servicePoint: point.name,
        kind: REQUISITION_KIND_LABELS[kind],
        lines: lines.map((line) => `${line.name} : ${line.quantity}`),
      },
      reason: isReturn ? requisition.comment : null,
    });
    for (const snapshot of await requisitionSnapshots(tx, ctx.establishmentId, {
      id: requisition.id,
    })) {
      await recordChange(tx, ctx, "requisition", snapshot.id, snapshot);
    }
  },
});

const tableCreated = handler({
  permission: "restaurant.table.manage",
  schema: tableCreatedSchema,
  async apply(tx, ctx, { table }) {
    const tables = await tx.diningTable.findMany({
      where: { establishmentId: ctx.establishmentId },
      select: { id: true, label: true, archivedAt: true },
    });
    const error = validateTableLabel(table.label, tables);
    if (error) throw new DomainError("INVALID_TABLE_LABEL", error);
    const created = await tx.diningTable.create({
      data: {
        id: table.id,
        establishmentId: ctx.establishmentId,
        label: table.label,
        sortOrder: table.sortOrder,
      },
    });
    await recordChange(tx, ctx, "dining_table", table.id, diningTableSnapshot(created));
  },
});

const tableRenamed = handler({
  permission: "restaurant.table.manage",
  schema: tableRenamedSchema,
  async apply(tx, ctx, payload) {
    const tables = await tx.diningTable.findMany({
      where: { establishmentId: ctx.establishmentId },
      select: { id: true, label: true, archivedAt: true },
    });
    const current = tables.find((table) => table.id === payload.tableId);
    if (!current) throw new DomainError("TABLE_NOT_FOUND", "Table inconnue du serveur.");
    const error = validateTableLabel(payload.after, tables, payload.tableId);
    if (error) throw new DomainError("INVALID_TABLE_LABEL", error);
    const renamed = await tx.diningTable.update({
      where: { id: payload.tableId },
      data: { label: payload.after },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.table.renamed",
      entity: "dining_table",
      entityId: payload.tableId,
      before: { label: current.label },
      after: { label: payload.after },
    });
    await recordChange(tx, ctx, "dining_table", payload.tableId, diningTableSnapshot(renamed));
  },
});

function tableArchiveHandler(archived: boolean) {
  return handler({
    permission: "restaurant.table.manage",
    schema: tableArchivedSchema,
    async apply(tx, ctx, payload) {
      const table = await tx.diningTable.findFirst({
        where: { id: payload.tableId, establishmentId: ctx.establishmentId },
      });
      if (!table) throw new DomainError("TABLE_NOT_FOUND", "Table inconnue du serveur.");
      const archivedAt = archived ? ctx.receivedAt : null;
      const updated = await tx.diningTable.update({
        where: { id: table.id },
        data: { archivedAt },
      });
      await writeAudit(tx, {
        establishmentId: ctx.establishmentId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        deviceId: ctx.deviceId,
        action: archived ? "restaurant.table.archived" : "restaurant.table.restored",
        entity: "dining_table",
        entityId: table.id,
      });
      await recordChange(tx, ctx, "dining_table", table.id, diningTableSnapshot(updated));
    },
  });
}

const tableReleased = handler({
  permission: "restaurant.table.release",
  schema: tableReleasedSchema,
  async apply(tx, ctx, { release }) {
    const table = await tx.diningTable.findFirst({
      where: { id: release.tableId, establishmentId: ctx.establishmentId },
    });
    if (!table) throw new DomainError("TABLE_NOT_FOUND", "Table inconnue du serveur.");
    await tx.tableRelease.create({
      data: {
        id: release.id,
        establishmentId: ctx.establishmentId,
        tableId: release.tableId,
        releasedAt: new Date(release.releasedAt),
        releasedBy: ctx.userId,
      },
    });
    const [snapshot] = await tableReleaseSnapshots(tx, ctx.establishmentId, { id: release.id });
    if (snapshot) await recordChange(tx, ctx, "table_release", release.id, snapshot);
  },
});

const exchangeRateAdded = handler({
  permission: "restaurant.exchange-rate.manage",
  schema: exchangeRateAddedSchema,
  async apply(tx, ctx, { rate }) {
    const parsed = parseRate(rate.rate);
    if (!parsed.ok) throw new DomainError("INVALID_RATE", parsed.message);
    const created = await tx.exchangeRate.create({
      data: {
        id: rate.id,
        establishmentId: ctx.establishmentId,
        rate: parsed.rate,
        effectiveAt: new Date(rate.effectiveAt),
        enteredBy: ctx.userId,
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.exchange-rate.added",
      entity: "exchange_rate",
      entityId: created.id,
      after: { rate: parsed.rate },
    });
    const [snapshot] = await exchangeRateSnapshots(tx, ctx.establishmentId, { id: created.id });
    if (snapshot) await recordChange(tx, ctx, "exchange_rate", created.id, snapshot);
  },
});

const paymentRecorded = handler({
  permission: "restaurant.payment.collect",
  schema: paymentRecordedSchema,
  async apply(tx, ctx, { payment }) {
    const invoiceIds = payment.allocations.map((allocation) => allocation.invoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new DomainError(
        "DUPLICATE_ALLOCATION",
        "Une facture apparaît deux fois dans le paiement.",
      );
    }
    const invoices = await tx.advanceInvoice.findMany({
      where: { id: { in: invoiceIds }, establishmentId: ctx.establishmentId },
    });
    if (invoices.length !== invoiceIds.length) {
      throw new DomainError("INVOICE_NOT_FOUND", "Une facture encaissée est inconnue du serveur.");
    }
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    for (const allocation of payment.allocations) {
      const invoice = invoiceById.get(allocation.invoiceId);
      if (!invoice) continue;
      if (invoice.cancelledAt) {
        throw new DomainError("INVOICE_CANCELLED", `La facture ${invoice.number} est annulée.`);
      }
      if (invoice.currency !== ctx.currency) {
        throw new DomainError(
          "CURRENCY_MISMATCH",
          "La facture n'est pas dans la devise de l'établissement.",
        );
      }
      if (BigInt(allocation.amountMinor) > invoice.totalMinor) {
        throw new DomainError(
          "ALLOCATION_TOO_HIGH",
          `Le montant affecté à la facture ${invoice.number} dépasse son total.`,
        );
      }
    }

    // Matrice des droits : un serveur n'encaisse que ses propres ventes.
    if (ctx.role === "waiter") {
      const orders = await tx.order.findMany({
        where: {
          id: { in: [...new Set(invoices.map((invoice) => invoice.orderId))] },
          establishmentId: ctx.establishmentId,
        },
        select: { waiterId: true },
      });
      if (orders.some((order) => order.waiterId !== ctx.userId)) {
        throw new DomainError(
          "FORBIDDEN",
          "Un serveur n'encaisse que ses propres ventes : le gérant peut encaisser à sa place.",
        );
      }
    }

    // RG-PRX-02 : le taux appliqué est celui enregistré sur le serveur, figé sur le paiement.
    const tendered = moneyFromMinor(payment.tendered.amountMinor, payment.tendered.currency);
    let rate: { id: string; rate: string } | null = null;
    if (tendered.currency !== ctx.currency) {
      const row = payment.rateId
        ? await tx.exchangeRate.findFirst({
            where: { id: payment.rateId, establishmentId: ctx.establishmentId },
          })
        : null;
      if (!row) {
        throw new DomainError(
          "RATE_NOT_FOUND",
          "Le taux du dollar utilisé est inconnu du serveur.",
        );
      }
      rate = { id: row.id, rate: rateText(row.rate) };
    }
    const baseAmount = rate ? convertMoney(tendered, ctx.currency, rate.rate) : tendered;
    const change = moneyFromMinor(payment.changeMinor, ctx.currency);
    const allocated = moneyFromMinor(
      payment.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0),
      ctx.currency,
    );
    const mismatch = checkPaymentConsistency({
      method: payment.method,
      provider: payment.provider,
      tendered,
      baseAmount,
      change,
      allocated,
      rate: rate?.rate ?? null,
    });
    if (mismatch) throw new DomainError("PAYMENT_MISMATCH", mismatch);

    await tx.payment.create({
      data: {
        id: payment.id,
        establishmentId: ctx.establishmentId,
        method: payment.method,
        provider: payment.method === "mobile-money" ? payment.provider : null,
        reference: payment.method === "mobile-money" ? payment.reference : null,
        currency: tendered.currency,
        amountMinor: BigInt(tendered.amountMinor),
        exchangeRateId: rate?.id ?? null,
        rate: rate?.rate ?? null,
        baseCurrency: ctx.currency,
        baseAmountMinor: BigInt(baseAmount.amountMinor),
        changeMinor: BigInt(change.amountMinor),
        collectedBy: ctx.userId,
        deviceId: ctx.deviceId,
        createdAt: new Date(payment.createdAt),
      },
    });
    await tx.paymentAllocation.createMany({
      data: payment.allocations.map((allocation) => ({
        establishmentId: ctx.establishmentId,
        paymentId: payment.id,
        invoiceId: allocation.invoiceId,
        amountMinor: BigInt(allocation.amountMinor),
      })),
    });

    // RG-OFF-03 : les paiements s'additionnent ; le statut de la facture en découle.
    const sums = await tx.paymentAllocation.groupBy({
      by: ["invoiceId"],
      where: { establishmentId: ctx.establishmentId, invoiceId: { in: invoiceIds } },
      _sum: { amountMinor: true },
    });
    for (const sum of sums) {
      const invoice = invoiceById.get(sum.invoiceId);
      if (!invoice) continue;
      const paid = sum._sum.amountMinor ?? 0n;
      // RG-ENC-01 : une remise accordée réduit ce que le client doit.
      const due = invoice.totalMinor - invoice.discountMinor;
      const status = paid >= due ? "paid" : paid > 0n ? "partial" : "unpaid";
      if (status !== invoice.paymentStatus) {
        await tx.advanceInvoice.update({
          where: { id: invoice.id },
          data: { paymentStatus: status },
        });
      }
      if (paid > invoice.totalMinor) {
        // Deux encaissements hors connexion de la même facture : rien n'est
        // refusé (l'argent a été reçu), le trop-perçu est signalé au gérant.
        await writeAudit(tx, {
          establishmentId: ctx.establishmentId,
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          deviceId: ctx.deviceId,
          action: "restaurant.payment.overpaid",
          entity: "advance_invoice",
          entityId: invoice.id,
          after: {
            number: invoice.number,
            total: formatMoney(moneyFromMinor(toSafeNumber(invoice.totalMinor), ctx.currency)),
            paid: formatMoney(moneyFromMinor(toSafeNumber(paid), ctx.currency)),
          },
        });
      }
    }

    const [snapshot] = await paymentSnapshots(tx, ctx.establishmentId, { id: payment.id });
    if (snapshot) await recordChange(tx, ctx, "payment", payment.id, snapshot);
    for (const orderId of new Set(invoices.map((invoice) => invoice.orderId))) {
      const updated = await orderSnapshots(tx, ctx.establishmentId, { id: orderId });
      for (const invoice of updated.invoices) {
        if (invoiceById.has(invoice.id)) {
          await recordChange(tx, ctx, "advance_invoice", invoice.id, invoice);
        }
      }
    }
  },
});

/** RG-CLO-02 : rien ne s'ajoute à une journée validée. */
async function assertDayOpen(tx: Tx, ctx: HandlerContext, day: string): Promise<void> {
  const validated = await tx.dayClosing.findFirst({
    where: { establishmentId: ctx.establishmentId, day },
    select: { id: true },
  });
  if (validated) {
    throw new DomainError(
      "DAY_VALIDATED",
      `La journée du ${day} est déjà validée : elle ne se modifie plus.`,
    );
  }
}

/** Factures et paiements d'une journée d'exploitation, vus par le serveur. */
async function dayActivity(tx: Tx, ctx: HandlerContext, day: string, until?: Date) {
  const start = new Date(businessDayStartOf(day, DEFAULT_BUSINESS_DAY_START_HOUR, ctx.timeZone));
  const end = until ?? new Date(start.getTime() + 24 * 3_600_000);
  const [activity, payments] = await Promise.all([
    orderSnapshots(tx, ctx.establishmentId, { createdAt: { gte: start, lt: end } }),
    paymentSnapshots(tx, ctx.establishmentId, { createdAt: { gte: start, lte: end } }),
  ]);
  return { start, end, invoices: activity.invoices, payments };
}

const cashClosingDeclared = handler({
  permission: "restaurant.closing.declare",
  schema: cashClosingDeclaredSchema,
  async apply(tx, ctx, { closing }) {
    await assertDayOpen(tx, ctx, closing.day);
    const payments = await paymentSnapshots(tx, ctx.establishmentId, {
      id: { in: closing.paymentIds },
    });
    if (payments.length !== closing.paymentIds.length) {
      throw new DomainError("PAYMENT_NOT_FOUND", "Un paiement déclaré est inconnu du serveur.");
    }
    if (payments.some((payment) => payment.collectedBy !== ctx.userId)) {
      throw new DomainError(
        "FORBIDDEN",
        "Une clôture ne couvre que l'argent que vous avez vous-même encaissé.",
      );
    }
    const alreadyClosed = await tx.cashClosingPayment.count({
      where: { establishmentId: ctx.establishmentId, paymentId: { in: closing.paymentIds } },
    });
    if (alreadyClosed > 0) {
      throw new DomainError(
        "PAYMENT_ALREADY_CLOSED",
        "Un paiement de cette déclaration figure déjà dans une clôture.",
      );
    }

    // EF-CLO-01 : l'attendu est recalculé par le serveur ; seul le compté vient de l'appareil.
    const expected = expectedCashLines(payments, ctx.currency);
    const counted = new Map(closing.counted.map((line) => [line.key, line]));
    if (
      counted.size !== expected.length ||
      expected.some((line) => counted.get(line.key)?.currency !== line.expected.currency)
    ) {
      throw new DomainError(
        "CLOSING_MISMATCH",
        "Les modes de paiement déclarés ne correspondent pas aux encaissements connus du serveur.",
      );
    }
    const lines: CashClosingLine[] = expected.map((line) => ({
      ...line,
      counted: moneyFromMinor(counted.get(line.key)?.amountMinor ?? 0, line.expected.currency),
    }));

    const declaredAt = new Date(closing.declaredAt);
    const activity = await dayActivity(tx, ctx, closing.day, declaredAt);
    const allocated = await tx.advanceInvoice.findMany({
      where: {
        establishmentId: ctx.establishmentId,
        id: { in: payments.flatMap((payment) => payment.allocations.map((a) => a.invoiceId)) },
      },
      select: { id: true, servicePointId: true },
    });
    const unpaid = unpaidInvoiceIds(
      activity.invoices,
      invoiceBalances(activity.invoices, activity.payments),
      ctx.userId,
    );
    const issue = validateCashClosing({
      lines,
      unpaidInvoiceIds: unpaid,
      comment: closing.comment ?? "",
    });
    if (issue) throw new DomainError(issue.code, issue.message);

    await tx.cashClosing.create({
      data: {
        id: closing.id,
        establishmentId: ctx.establishmentId,
        day: closing.day,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
        declaredAt,
        lines: toJson(lines),
        byServicePoint: toJson(collectedByServicePoint(payments, allocated, ctx.currency)),
        unpaidInvoiceIds: toJson(unpaid),
        comment: closing.comment,
      },
    });
    await tx.cashClosingPayment.createMany({
      data: closing.paymentIds.map((paymentId) => ({
        establishmentId: ctx.establishmentId,
        closingId: closing.id,
        paymentId,
      })),
    });
    // EF-AUD-01 : les clôtures et leurs écarts sont tracés.
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.cash-closing.declared",
      entity: "cash_closing",
      entityId: closing.id,
      after: {
        day: closing.day,
        expected: lines.map((line) => formatMoney(line.expected)),
        counted: lines.map((line) => formatMoney(line.counted)),
        unpaid: unpaid.length,
      },
      reason: closing.comment,
    });
    const [snapshot] = await cashClosingSnapshots(tx, ctx.establishmentId, { id: closing.id });
    if (snapshot) await recordChange(tx, ctx, "cash_closing", closing.id, snapshot);
  },
});

const stockCounted = handler({
  permission: "restaurant.closing.count-stock",
  schema: stockCountedSchema,
  async apply(tx, ctx, { count }) {
    await assertDayOpen(tx, ctx, count.day);
    const point = await tx.servicePoint.findFirst({
      where: { id: count.servicePointId, establishmentId: ctx.establishmentId },
    });
    if (!point) throw new DomainError("SERVICE_POINT_NOT_FOUND", "Point de service inconnu.");
    const items = (
      await tx.menuItem.findMany({
        where: { establishmentId: ctx.establishmentId, servicePointId: point.id },
      })
    ).map(menuItemSnapshot);
    const required = itemsRequiringMorningStock(items, point.id);
    const provided = new Map(count.lines.map((line) => [line.menuItemId, line]));
    if (required.some((item) => !provided.has(item.id))) {
      throw new DomainError(
        "COUNT_INCOMPLETE",
        "Le comptage ne couvre pas tous les éléments du point de service : synchronisez puis recomptez.",
      );
    }
    const itemById = new Map(items.map((item) => [item.id, item]));
    if (count.lines.some((line) => !itemById.has(line.menuItemId))) {
      throw new DomainError(
        "ITEM_NOT_FOUND",
        "Un élément compté n'appartient pas à ce point de service.",
      );
    }

    // Stock du matin et ventes relus par le serveur (CLAUDE.md § 3.9).
    const morning = currentEntries(
      await morningEntrySnapshots(tx, ctx.establishmentId, { day: count.day }),
    );
    const activity = await dayActivity(tx, ctx, count.day);
    const sold = new Map<string, number>();
    for (const invoice of activity.invoices) {
      if (invoice.paymentStatus === "cancelled") continue;
      for (const line of invoice.lines) {
        sold.set(line.menuItemId, (sold.get(line.menuItemId) ?? 0) + line.quantity);
      }
    }
    // Compléments moins retours au magasin (D-069), relus eux aussi.
    const later = laterRequisitioned(
      await requisitionSnapshots(tx, ctx.establishmentId, { day: count.day }),
      count.day,
    );
    const lines: StockCountLine[] = count.lines.map((line) => {
      const item = itemById.get(line.menuItemId);
      return {
        menuItemId: line.menuItemId,
        name: item?.name ?? "",
        unit: item?.unit ?? "bottle",
        morning: morning.get(line.menuItemId)?.quantity ?? null,
        requisitioned: later.get(line.menuItemId) ?? 0,
        sold: sold.get(line.menuItemId) ?? 0,
        declaredOut: line.declaredOut,
        outReason: line.outReason,
        counted: line.counted,
      };
    });
    // Le serveur contrôle la forme (quantités, motif des sorties) ; l'exigence d'un
    // commentaire dépend de l'écart vu au moment du comptage, contrôlée sur l'appareil.
    const issue = validateStockCount({ lines, comment: "commentaire" })[0];
    if (issue) throw new DomainError(issue.code, issue.message);

    await tx.stockCount.create({
      data: {
        id: count.id,
        establishmentId: ctx.establishmentId,
        day: count.day,
        servicePointId: point.id,
        countedAt: new Date(count.countedAt),
        countedBy: ctx.userId,
        lines: toJson(lines),
        comment: count.comment,
      },
    });
    const variances = lines
      .map((line) => ({ name: line.name, variance: stockLineVariance(line) }))
      .filter((line) => line.variance !== null && line.variance !== 0)
      .map((line) => `${line.name} : ${line.variance}`);
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.stock.counted",
      entity: "service_point",
      entityId: point.id,
      after: { day: count.day, variances },
      reason: count.comment,
    });
    const [snapshot] = await stockCountSnapshots(tx, ctx.establishmentId, { id: count.id });
    if (snapshot) await recordChange(tx, ctx, "stock_count", count.id, snapshot);
  },
});

const dayValidated = handler({
  permission: "restaurant.closing.validate",
  schema: dayValidatedSchema,
  async apply(tx, ctx, { closing }) {
    await assertDayOpen(tx, ctx, closing.day);
    const validatedAt = new Date(closing.validatedAt);

    // RG-CLO-03 : un appareil qui a encore des opérations à envoyer bloque la validation.
    const waiting = await tx.device.findMany({
      where: {
        establishmentId: ctx.establishmentId,
        revokedAt: null,
        pendingOperations: { gt: 0 },
      },
      select: { code: true, pendingOperations: true },
    });
    const first = waiting[0];
    if (first) {
      throw new DomainError(
        "PENDING_OPERATIONS",
        `L'appareil ${first.code} a encore ${first.pendingOperations} opération(s) à envoyer : connectez-le avant de valider.`,
      );
    }

    const [points, items, counts, closings] = await Promise.all([
      tx.servicePoint.findMany({
        where: { establishmentId: ctx.establishmentId },
        orderBy: { sortOrder: "asc" },
      }),
      tx.menuItem.findMany({ where: { establishmentId: ctx.establishmentId } }),
      stockCountSnapshots(tx, ctx.establishmentId, { day: closing.day }),
      tx.cashClosingPayment.findMany({
        where: { establishmentId: ctx.establishmentId },
        select: { paymentId: true },
      }),
    ]);
    const menu = items.map(menuItemSnapshot);
    const morning = currentEntries(
      await morningEntrySnapshots(tx, ctx.establishmentId, { day: closing.day }),
    );
    const latest = latestStockCounts(counts, closing.day);
    const required = points.filter(
      (point) => itemsRequiringMorningStock(menu, point.id).length > 0,
    );
    const activity = await dayActivity(tx, ctx, closing.day, validatedAt);
    const closed = new Set(closings.map((link) => link.paymentId));
    const issue = dayClosingIssues({
      isAlreadyValidated: false,
      pointsMissingMorningStock: required
        .filter((point) => !isMorningStockComplete(menu, point.id, morning))
        .map((point) => point.name),
      pointsNotCounted: required
        .filter((point) => !latest.has(point.id))
        .map((point) => point.name),
      undeclaredCollectors: collectorsWithUnclosedPayments(
        activity.payments.filter((payment) => !closed.has(payment.id)),
        [],
      ).map((entry) => entry.name),
      pendingOperations: 0,
      isOnline: true,
    })[0];
    if (issue) throw new DomainError(issue.code, issue.message);

    const cashClosings = await tx.cashClosing.findMany({
      where: { establishmentId: ctx.establishmentId, day: closing.day },
      select: { id: true },
    });
    const stockCountIds = [...latest.values()].map((count) => count.id);
    await tx.dayClosing.create({
      data: {
        id: closing.id,
        establishmentId: ctx.establishmentId,
        day: closing.day,
        validatedAt,
        validatedBy: ctx.userId,
        cashClosingIds: toJson(cashClosings.map((entry) => entry.id)),
        stockCountIds: toJson(stockCountIds),
        comment: closing.comment,
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.day.validated",
      entity: "day_closing",
      entityId: closing.id,
      after: { day: closing.day, closings: cashClosings.length, counts: stockCountIds.length },
      reason: closing.comment,
    });
    const [snapshot] = await dayClosingSnapshots(tx, ctx.establishmentId, { id: closing.id });
    if (snapshot) await recordChange(tx, ctx, "day_closing", closing.id, snapshot);
  },
});

/**
 * État d'une commande vu par le serveur pour une annulation ou une remise :
 * factures (remises comprises), soldes, journée validée, demande en attente.
 */
async function adjustmentState(
  tx: Tx,
  ctx: HandlerContext,
  order: { id: string; createdAt: Date },
) {
  const { invoices } = await orderSnapshots(tx, ctx.establishmentId, { id: order.id });
  const sums = await tx.paymentAllocation.groupBy({
    by: ["invoiceId"],
    where: {
      establishmentId: ctx.establishmentId,
      invoiceId: { in: invoices.map((invoice) => invoice.id) },
    },
    _sum: { amountMinor: true },
  });
  const balances = invoiceBalances(
    invoices,
    sums.map((sum) => ({
      allocations: [
        {
          invoiceId: sum.invoiceId,
          amount: moneyFromMinor(toSafeNumber(sum._sum.amountMinor ?? 0n), ctx.currency),
        },
      ],
    })),
  );
  const day = businessDayKey(
    order.createdAt.toISOString(),
    DEFAULT_BUSINESS_DAY_START_HOUR,
    ctx.timeZone,
  );
  const [validated, requests] = await Promise.all([
    // RG-CLO-02 : seule une commande antérieure à la validation est figée ; ce qui
    // suit la validation appartient à la journée suivante (D-039).
    tx.dayClosing.count({
      where: { establishmentId: ctx.establishmentId, day, validatedAt: { gte: order.createdAt } },
    }),
    tx.adjustmentRequest.findMany({
      where: { establishmentId: ctx.establishmentId, orderId: order.id },
      select: { id: true },
    }),
  ]);
  const decided = await tx.adjustmentDecision.count({
    where: {
      establishmentId: ctx.establishmentId,
      requestId: { in: requests.map((request) => request.id) },
    },
  });
  return {
    invoices,
    balances,
    isDayValidated: validated > 0,
    hasPendingRequest: requests.length > decided,
  };
}

const adjustmentRequested = handler({
  permission: "restaurant.adjustment.request",
  schema: adjustmentRequestedSchema,
  async apply(tx, ctx, { request }) {
    const order = await tx.order.findFirst({
      where: { id: request.orderId, establishmentId: ctx.establishmentId },
    });
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Commande inconnue du serveur.");
    // RG-CMD-03 : une commande appartient au serveur qui l'a créée.
    if (ctx.role === "waiter" && order.waiterId !== ctx.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Un serveur ne demande d'ajustement que sur ses propres commandes.",
      );
    }
    const state = await adjustmentState(tx, ctx, order);
    const discount =
      request.kind === "discount" && request.discountMinor !== null
        ? moneyFromMinor(request.discountMinor, ctx.currency)
        : null;
    const credit =
      request.kind === "credit"
        ? await serverCreditState(tx, ctx, request.customerId, state.invoices)
        : null;
    const issue = adjustmentIssue({
      kind: request.kind,
      reason: request.reason,
      discount,
      balances: [...state.balances.values()],
      isDayValidated: state.isDayValidated,
      hasPendingRequest: state.hasPendingRequest,
      ...(credit ? { credit: credit.state } : {}),
    });
    if (issue) throw new DomainError(issue.code, issue.message);

    await tx.adjustmentRequest.create({
      data: {
        id: request.id,
        establishmentId: ctx.establishmentId,
        kind: request.kind,
        orderId: order.id,
        invoiceIds: toJson(
          state.invoices
            .filter((invoice) => invoice.paymentStatus !== "cancelled")
            .map((invoice) => invoice.id),
        ),
        reason: request.reason,
        discountMinor: discount ? BigInt(discount.amountMinor) : null,
        customerId: credit?.customer?.id ?? null,
        requestedBy: ctx.userId,
        deviceId: ctx.deviceId,
        requestedAt: new Date(request.requestedAt),
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.adjustment.requested",
      entity: "order",
      entityId: order.id,
      after: {
        kind: ADJUSTMENT_LABELS[request.kind],
        number: order.number,
        ...(discount ? { discount: formatMoney(discount) } : {}),
        ...(credit?.customer ? { customer: credit.customer.name } : {}),
      },
      reason: request.reason,
    });
    const [snapshot] = await adjustmentRequestSnapshots(tx, ctx.establishmentId, {
      id: request.id,
    });
    if (snapshot) await recordChange(tx, ctx, "adjustment_request", request.id, snapshot);
  },
});

const adjustmentDecided = handler({
  permission: "restaurant.adjustment.approve",
  schema: adjustmentDecidedSchema,
  async apply(tx, ctx, { decision }) {
    const request = await tx.adjustmentRequest.findFirst({
      where: { id: decision.requestId, establishmentId: ctx.establishmentId },
    });
    if (!request) throw new DomainError("REQUEST_NOT_FOUND", "Demande inconnue du serveur.");
    const already = await tx.adjustmentDecision.count({
      where: { establishmentId: ctx.establishmentId, requestId: request.id },
    });
    if (already > 0) {
      throw new DomainError("ALREADY_DECIDED", "Cette demande a déjà reçu une décision.");
    }
    if (!decision.approved && (decision.comment ?? "").length < MIN_ADJUSTMENT_REASON) {
      throw new DomainError("COMMENT_REQUIRED", "Un refus doit être expliqué au serveur.");
    }
    const order = await tx.order.findFirst({
      where: { id: request.orderId, establishmentId: ctx.establishmentId },
    });
    if (!order) throw new DomainError("ORDER_NOT_FOUND", "Commande inconnue du serveur.");
    const decidedAt = new Date(decision.decidedAt);
    const targetIds = new Set(jsonArray<string>(request.invoiceIds));
    let discounts: PaymentAllocation[] = [];

    if (decision.approved) {
      const state = await adjustmentState(tx, ctx, order);
      const targets = state.invoices.filter((invoice) => targetIds.has(invoice.id));
      const discount =
        request.discountMinor === null
          ? null
          : moneyFromMinor(toSafeNumber(request.discountMinor), ctx.currency);
      const issue = adjustmentIssue({
        kind: request.kind as AdjustmentKind,
        reason: request.reason,
        discount,
        balances: targets.flatMap((invoice) => {
          const balance = state.balances.get(invoice.id);
          return balance ? [balance] : [];
        }),
        isDayValidated: state.isDayValidated,
        hasPendingRequest: false,
        ...(request.kind === "credit"
          ? { credit: (await serverCreditState(tx, ctx, request.customerId, targets)).state }
          : {}),
      });
      if (issue) throw new DomainError(issue.code, issue.message);

      if (request.kind === "credit") {
        // D-059 : le reste de chaque facture devient la dette du client.
        for (const invoice of targets) {
          const remaining = state.balances.get(invoice.id)?.remaining;
          if (!remaining || remaining.amountMinor <= 0) continue;
          await tx.advanceInvoice.update({
            where: { id: invoice.id },
            data: {
              creditRequestId: request.id,
              creditedMinor: BigInt(remaining.amountMinor),
            },
          });
        }
      } else if (request.kind === "cancel") {
        // RG-CMD-02 : la facture garde son numéro ; le stock se rétablit, les
        // ventes ne comptant que les factures non annulées.
        await tx.advanceInvoice.updateMany({
          where: {
            establishmentId: ctx.establishmentId,
            id: { in: targets.map((invoice) => invoice.id) },
          },
          data: { cancelledAt: decidedAt, cancelReason: request.reason },
        });
      } else if (discount) {
        discounts = splitDiscount(
          discount,
          targets.map((invoice) => ({
            id: invoice.id,
            remaining: state.balances.get(invoice.id)?.remaining ?? invoice.total,
          })),
        );
        for (const share of discounts) {
          const balance = state.balances.get(share.invoiceId);
          const settled =
            balance !== undefined && balance.remaining.amountMinor - share.amount.amountMinor <= 0;
          await tx.advanceInvoice.update({
            where: { id: share.invoiceId },
            data: {
              discountMinor: { increment: BigInt(share.amount.amountMinor) },
              ...(settled ? { paymentStatus: "paid" } : {}),
            },
          });
        }
      }
    }

    await tx.adjustmentDecision.create({
      data: {
        id: decision.id,
        establishmentId: ctx.establishmentId,
        requestId: request.id,
        approved: decision.approved,
        comment: decision.comment,
        discounts: toJson(discounts),
        decidedBy: ctx.userId,
        deviceId: ctx.deviceId,
        decidedAt,
      },
    });
    // EF-AUD-01 : annulations et remises sont tracées, avec leur motif.
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: !decision.approved
        ? "restaurant.adjustment.rejected"
        : request.kind === "cancel"
          ? "restaurant.invoice.cancelled"
          : request.kind === "credit"
            ? "restaurant.credit.granted"
            : "restaurant.discount.granted",
      entity: "order",
      entityId: order.id,
      after: {
        number: order.number,
        ...(request.discountMinor !== null
          ? {
              discount: formatMoney(
                moneyFromMinor(toSafeNumber(request.discountMinor), ctx.currency),
              ),
            }
          : {}),
      },
      reason: decision.approved ? request.reason : decision.comment,
    });
    const [snapshot] = await adjustmentDecisionSnapshots(tx, ctx.establishmentId, {
      id: decision.id,
    });
    if (snapshot) await recordChange(tx, ctx, "adjustment_decision", decision.id, snapshot);
    if (decision.approved) {
      const updated = await orderSnapshots(tx, ctx.establishmentId, { id: order.id });
      for (const invoice of updated.invoices) {
        if (targetIds.has(invoice.id)) {
          await recordChange(tx, ctx, "advance_invoice", invoice.id, invoice);
        }
      }
    }
  },
});

/**
 * Contrôles serveur de la vente à crédit (EF-ENC-03, D-037, D-059) : client
 * de l'établissement, commande pas encore à crédit, plafond respecté.
 */
async function serverCreditState(
  tx: Tx,
  ctx: HandlerContext,
  customerId: string | null,
  invoices: readonly { creditRequestId?: string | null }[],
) {
  const customer = customerId
    ? await tx.customer.findFirst({
        where: { id: customerId, establishmentId: ctx.establishmentId },
      })
    : null;
  let outstanding = moneyFromMinor(0, ctx.currency);
  if (customer) {
    const credits = await tx.adjustmentRequest.findMany({
      where: { establishmentId: ctx.establishmentId, kind: "credit", customerId: customer.id },
      select: { id: true },
    });
    const approved = await tx.adjustmentDecision.findMany({
      where: {
        establishmentId: ctx.establishmentId,
        approved: true,
        requestId: { in: credits.map((request) => request.id) },
      },
      select: { requestId: true },
    });
    const owed = await tx.advanceInvoice.findMany({
      where: {
        establishmentId: ctx.establishmentId,
        creditRequestId: { in: approved.map((decision) => decision.requestId) },
        cancelledAt: null,
      },
      select: { id: true, totalMinor: true, discountMinor: true },
    });
    const paid = await tx.paymentAllocation.groupBy({
      by: ["invoiceId"],
      where: { establishmentId: ctx.establishmentId, invoiceId: { in: owed.map((row) => row.id) } },
      _sum: { amountMinor: true },
    });
    const paidBy = new Map(paid.map((row) => [row.invoiceId, row._sum.amountMinor ?? 0n]));
    const remaining = owed.reduce((sum, row) => {
      const left = row.totalMinor - row.discountMinor - (paidBy.get(row.id) ?? 0n);
      return sum + (left > 0n ? left : 0n);
    }, 0n);
    outstanding = moneyFromMinor(toSafeNumber(remaining), ctx.currency);
  }
  return {
    customer,
    state: {
      hasCustomer: customer !== null,
      isAlreadyCredited: invoices.some((invoice) => Boolean(invoice.creditRequestId)),
      creditLimit:
        customer?.creditLimitMinor === null || customer?.creditLimitMinor === undefined
          ? null
          : moneyFromMinor(toSafeNumber(customer.creditLimitMinor), ctx.currency),
      outstanding,
    },
  };
}

const customerCreated = handler({
  permission: "restaurant.customer.create",
  schema: customerCreatedSchema,
  async apply(tx, ctx, { customer }) {
    const existing = await tx.customer.findMany({
      where: { establishmentId: ctx.establishmentId },
      select: { phone: true },
    });
    const issue = customerIssue(customer, existing);
    if (issue) throw new DomainError(issue.code, issue.message);
    const created = await tx.customer.create({
      data: {
        id: customer.id,
        establishmentId: ctx.establishmentId,
        name: customer.name,
        phone: normalizePhone(customer.phone) ?? customer.phone,
        createdBy: ctx.userId,
        createdAt: new Date(customer.createdAt),
      },
    });
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.customer.created",
      entity: "customer",
      entityId: created.id,
      after: { name: created.name, phone: created.phone },
    });
    await recordChange(tx, ctx, "customer", created.id, customerSnapshot(created, ctx.currency));
  },
});

const customerLimitSet = handler({
  permission: "restaurant.customer.manage",
  schema: customerLimitSetSchema,
  async apply(tx, ctx, payload) {
    const customer = await tx.customer.findFirst({
      where: { id: payload.customerId, establishmentId: ctx.establishmentId },
    });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client inconnu du serveur.");
    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: {
        creditLimitMinor:
          payload.creditLimitMinor === null ? null : BigInt(payload.creditLimitMinor),
      },
    });
    const limit = (value: bigint | null) =>
      value === null ? "aucun" : formatMoney(moneyFromMinor(toSafeNumber(value), ctx.currency));
    await writeAudit(tx, {
      establishmentId: ctx.establishmentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      deviceId: ctx.deviceId,
      action: "restaurant.customer.limit-set",
      entity: "customer",
      entityId: customer.id,
      before: { creditLimit: limit(customer.creditLimitMinor) },
      after: { creditLimit: limit(updated.creditLimitMinor) },
    });
    await recordChange(tx, ctx, "customer", customer.id, customerSnapshot(updated, ctx.currency));
  },
});

export const RESTAURANT_HANDLERS: Record<string, OperationHandler> = {
  "restaurant.order.created": orderCreated,
  "restaurant.invoice.prep-status-changed": prepStatusChanged,
  "restaurant.menu-item.created": menuItemCreated,
  "restaurant.menu-item.options-set": menuItemOptionsSet,
  "restaurant.menu-item.sold-out-set": menuItemSoldOutSet,
  "restaurant.morning-stock.entered": morningStockEntered,
  "restaurant.requisition.created": requisitionCreated,
  "restaurant.table.created": tableCreated,
  "restaurant.table.renamed": tableRenamed,
  "restaurant.table.archived": tableArchiveHandler(true),
  "restaurant.table.restored": tableArchiveHandler(false),
  "restaurant.table.released": tableReleased,
  "restaurant.exchange-rate.added": exchangeRateAdded,
  "restaurant.payment.recorded": paymentRecorded,
  "restaurant.cash-closing.declared": cashClosingDeclared,
  "restaurant.stock.counted": stockCounted,
  "restaurant.day.validated": dayValidated,
  "restaurant.adjustment.requested": adjustmentRequested,
  "restaurant.adjustment.decided": adjustmentDecided,
  "restaurant.customer.created": customerCreated,
  "restaurant.customer.limit-set": customerLimitSet,
};
