import type { Currency, Money } from "@/shared/lib/money";

import type {
  AdvanceInvoice,
  DiningTable,
  MenuItem,
  MorningStockEntry,
  Order,
  OrderLine,
  OrderMode,
  PaymentStatus,
  PrepStatus,
  SaleUnit,
  ServicePoint,
  ServicePointKind,
  MenuKind,
  TableRelease,
} from "@/modules/restaurant/domain/types";

import type { Tx } from "../db/context";
import { toSafeNumber } from "../db/context";

/**
 * Conversion des lignes de la base vers les enregistrements stockés sur les
 * appareils (types de `modules/restaurant/domain/types.ts`). Utilisée par le
 * journal des changements (pull) et par l'état initial d'un appareil.
 * Chaque requête porte la condition `establishment_id` (IDOR, CLAUDE.md § 5.4).
 */

function money(amountMinor: bigint, currency: string): Money {
  return { amountMinor: toSafeNumber(amountMinor), currency: currency as Currency };
}

async function userNames(tx: Tx, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((user) => [user.id, user.displayName]));
}

export function servicePointSnapshot(row: {
  id: string;
  establishmentId: string;
  kind: string;
  name: string;
  menu: string;
  sortOrder: number;
}): ServicePoint {
  return {
    id: row.id,
    establishmentId: row.establishmentId,
    kind: row.kind as ServicePointKind,
    name: row.name,
    menu: row.menu as MenuKind,
    sortOrder: row.sortOrder,
  };
}

export function menuItemSnapshot(row: {
  id: string;
  establishmentId: string;
  servicePointId: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  priceMinor: bigint | null;
  currency: string;
  createdAt: Date;
  archivedAt: Date | null;
}): MenuItem {
  return {
    id: row.id,
    establishmentId: row.establishmentId,
    servicePointId: row.servicePointId,
    name: row.name,
    description: row.description,
    category: row.category,
    unit: row.unit as SaleUnit,
    price: row.priceMinor === null ? null : money(row.priceMinor, row.currency),
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function diningTableSnapshot(row: {
  id: string;
  establishmentId: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
  archivedAt: Date | null;
}): DiningTable {
  return {
    id: row.id,
    establishmentId: row.establishmentId,
    label: row.label,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export async function tableReleaseSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string; releasedAt?: { gte: Date } },
): Promise<TableRelease[]> {
  const rows = await tx.tableRelease.findMany({ where: { ...where, establishmentId } });
  const names = await userNames(
    tx,
    rows.map((row) => row.releasedBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    tableId: row.tableId,
    releasedAt: row.releasedAt.toISOString(),
    releasedBy: row.releasedBy,
    releasedByName: names.get(row.releasedBy) ?? "",
  }));
}

export async function morningEntrySnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: { in: string[] }; enteredAt?: { gte: Date } },
): Promise<MorningStockEntry[]> {
  const rows = await tx.morningStockEntry.findMany({ where: { ...where, establishmentId } });
  const names = await userNames(
    tx,
    rows.map((row) => row.enteredBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    day: row.day,
    servicePointId: row.servicePointId,
    menuItemId: row.menuItemId,
    quantity: row.quantity,
    proposed: row.proposed,
    reason: row.reason,
    replacesId: row.replacesId,
    enteredAt: row.enteredAt.toISOString(),
    enteredBy: row.enteredBy,
    enteredByName: names.get(row.enteredBy) ?? "",
  }));
}

/**
 * Commandes et factures d'avance, reconstituées avec leurs lignes, le nom du
 * serveur et le code de l'appareil émetteur.
 */
export async function orderSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string; createdAt?: { gte: Date } },
): Promise<{ orders: Order[]; invoices: AdvanceInvoice[] }> {
  const orders = await tx.order.findMany({ where: { ...where, establishmentId } });
  if (orders.length === 0) return { orders: [], invoices: [] };
  const orderIds = orders.map((order) => order.id);
  const invoiceRows = await tx.advanceInvoice.findMany({
    where: { establishmentId, orderId: { in: orderIds } },
  });
  const lineRows = await tx.invoiceLine.findMany({
    where: { establishmentId, invoiceId: { in: invoiceRows.map((invoice) => invoice.id) } },
  });
  const devices = await tx.device.findMany({
    where: { establishmentId, id: { in: [...new Set(orders.map((order) => order.deviceId))] } },
    select: { id: true, code: true },
  });
  const deviceCode = new Map(devices.map((device) => [device.id, device.code]));
  const names = await userNames(
    tx,
    orders.map((order) => order.waiterId),
  );
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const invoices: AdvanceInvoice[] = invoiceRows.map((row) => {
    const order = orderById.get(row.orderId);
    const lines: OrderLine[] = lineRows
      .filter((line) => line.invoiceId === row.id)
      .map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        servicePointId: row.servicePointId,
        unit: line.unit as SaleUnit,
        unitPrice: money(line.unitPriceMinor, row.currency),
        quantity: line.quantity,
      }));
    return {
      id: row.id,
      establishmentId: row.establishmentId,
      orderId: row.orderId,
      servicePointId: row.servicePointId,
      number: row.number,
      mode: (order?.mode ?? "dine-in") as OrderMode,
      tableLabel: order?.tableLabel ?? null,
      waiterId: order?.waiterId ?? "",
      waiterName: names.get(order?.waiterId ?? "") ?? "",
      deviceCode: deviceCode.get(order?.deviceId ?? "") ?? "",
      createdAt: row.createdAt.toISOString(),
      lines,
      total: money(row.totalMinor, row.currency),
      prepStatus: row.prepStatus as PrepStatus,
      paymentStatus: (row.cancelledAt ? "cancelled" : row.paymentStatus) as PaymentStatus,
    };
  });

  return {
    orders: orders.map((order) => {
      const own = invoices.filter((invoice) => invoice.orderId === order.id);
      return {
        id: order.id,
        establishmentId: order.establishmentId,
        number: order.number,
        mode: order.mode as OrderMode,
        tableId: order.tableId,
        tableLabel: order.tableLabel,
        waiterId: order.waiterId,
        waiterName: names.get(order.waiterId) ?? "",
        deviceCode: deviceCode.get(order.deviceId) ?? "",
        createdAt: order.createdAt.toISOString(),
        lines: own.flatMap((invoice) => invoice.lines),
        total: money(order.totalMinor, order.currency),
        invoiceIds: own.map((invoice) => invoice.id),
      };
    }),
    invoices,
  };
}
