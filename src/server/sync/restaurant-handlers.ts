import type { z } from "zod";

import { DomainError } from "@/shared/lib/errors";
import { moneyFromMinor, type Currency } from "@/shared/lib/money";

import { splitOrderByServicePoint } from "@/modules/restaurant/domain/order";
import { validateTableLabel } from "@/modules/restaurant/domain/tables";
import type { OrderLine, SaleUnit } from "@/modules/restaurant/domain/types";
import type { Permission } from "@/modules/registry";
import {
  menuItemCreatedSchema,
  morningStockEnteredSchema,
  orderCreatedSchema,
  prepStatusChangedSchema,
  tableArchivedSchema,
  tableCreatedSchema,
  tableReleasedSchema,
  tableRenamedSchema,
} from "@/modules/restaurant/schemas/sync";

import { writeAudit } from "../audit/audit";
import type { Tx } from "../db/context";
import { toJson, toSafeNumber } from "../db/context";

export type HandlerContext = {
  establishmentId: string;
  deviceId: string;
  deviceCode: string;
  userId: string;
  role: string;
  currency: Currency;
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

    const ids = [...new Set(payload.lines.map((line) => line.menuItemId))];
    const [items, servicePoints] = await Promise.all([
      tx.menuItem.findMany({ where: { id: { in: ids }, establishmentId: ctx.establishmentId } }),
      tx.servicePoint.findMany({
        where: { establishmentId: ctx.establishmentId },
        select: { id: true, sortOrder: true },
      }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));

    // Prix relus côté serveur (CLAUDE.md § 3.9, RG-RES-02) : le serveur fait foi.
    const lines: OrderLine[] = payload.lines.map((line) => {
      const item = itemById.get(line.menuItemId);
      if (!item)
        throw new DomainError("ITEM_NOT_FOUND", "Un élément commandé est inconnu du serveur.");
      if (item.priceMinor === null) {
        throw new DomainError("PRICE_NOT_SET", `« ${item.name} » n'a pas de prix (RG-PRX-01).`);
      }
      return {
        menuItemId: item.id,
        name: item.name,
        servicePointId: item.servicePointId,
        unit: item.unit as SaleUnit,
        unitPrice: moneyFromMinor(toSafeNumber(item.priceMinor), ctx.currency),
        quantity: line.quantity,
      };
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
        })),
      });
      await recordChange(tx, ctx, "advance_invoice", invoice.id, {
        ...invoice,
        orderId: payload.orderId,
        lines: group.lines,
        total: group.total,
        createdAt: payload.createdAt,
        waiterId: ctx.userId,
      });
    }
    await recordChange(tx, ctx, "order", payload.orderId, {
      id: payload.orderId,
      number: payload.number,
      mode: payload.mode,
      tableId: payload.tableId,
      tableLabel,
      waiterId: ctx.userId,
      totalMinor: total,
      createdAt: payload.createdAt,
    });
  },
});

const prepStatusChanged = handler({
  permission: "restaurant.order.prep-status",
  schema: prepStatusChangedSchema,
  async apply(tx, ctx, payload) {
    const invoice = await tx.advanceInvoice.findFirst({
      where: { id: payload.invoiceId, establishmentId: ctx.establishmentId },
    });
    if (!invoice) throw new DomainError("INVOICE_NOT_FOUND", "Facture inconnue du serveur.");
    if (invoice.cancelledAt)
      throw new DomainError("INVOICE_CANCELLED", "Cette facture est annulée.");
    await tx.advanceInvoice.update({
      where: { id: invoice.id },
      data: { prepStatus: payload.status },
    });
    await recordChange(tx, ctx, "advance_invoice.prep_status", invoice.id, payload);
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
    await tx.menuItem.create({
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
    await recordChange(tx, ctx, "menu_item", item.id, item);
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
    for (const entry of payload.entries) {
      await recordChange(tx, ctx, "morning_stock_entry", entry.id, { ...entry, day: payload.day });
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
    await tx.diningTable.create({
      data: {
        id: table.id,
        establishmentId: ctx.establishmentId,
        label: table.label,
        sortOrder: table.sortOrder,
      },
    });
    await recordChange(tx, ctx, "dining_table", table.id, table);
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
    await tx.diningTable.update({ where: { id: payload.tableId }, data: { label: payload.after } });
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
    await recordChange(tx, ctx, "dining_table", payload.tableId, { label: payload.after });
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
      await tx.diningTable.update({ where: { id: table.id }, data: { archivedAt } });
      await writeAudit(tx, {
        establishmentId: ctx.establishmentId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        deviceId: ctx.deviceId,
        action: archived ? "restaurant.table.archived" : "restaurant.table.restored",
        entity: "dining_table",
        entityId: table.id,
      });
      await recordChange(tx, ctx, "dining_table", table.id, { archivedAt });
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
    await recordChange(tx, ctx, "table_release", release.id, release);
  },
});

export const RESTAURANT_HANDLERS: Record<string, OperationHandler> = {
  "restaurant.order.created": orderCreated,
  "restaurant.invoice.prep-status-changed": prepStatusChanged,
  "restaurant.menu-item.created": menuItemCreated,
  "restaurant.morning-stock.entered": morningStockEntered,
  "restaurant.table.created": tableCreated,
  "restaurant.table.renamed": tableRenamed,
  "restaurant.table.archived": tableArchiveHandler(true),
  "restaurant.table.restored": tableArchiveHandler(false),
  "restaurant.table.released": tableReleased,
};
