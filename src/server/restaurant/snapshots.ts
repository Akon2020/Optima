import type { Currency, Money } from "@/shared/lib/money";

import type {
  AdjustmentDecision,
  AdjustmentKind,
  AdjustmentRequest,
  AdvanceInvoice,
  CashClosing,
  CashClosingLine,
  Customer,
  DayClosing,
  DiningTable,
  ExchangeRate,
  MenuItem,
  MobileMoneyProvider,
  MorningStockEntry,
  Order,
  OrderLine,
  OrderMode,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentStatus,
  PrepStatus,
  SaleUnit,
  ServicePoint,
  ServicePointKind,
  MenuKind,
  StockCount,
  StockCountLine,
  TableRelease,
} from "@/modules/restaurant/domain/types";

import { parseRate } from "@/modules/restaurant/domain/payment";

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
  where: { id?: { in: string[] }; enteredAt?: { gte: Date }; day?: string },
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
  where: { id?: string | { in: string[] }; createdAt?: { gte: Date; lt?: Date } },
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
      discount: money(row.discountMinor, row.currency),
      cancelReason: row.cancelReason,
      creditRequestId: row.creditRequestId,
      credited: money(row.creditedMinor, row.currency),
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

/** Taux enregistré en `NUMERIC(18,6)`, rendu sous sa forme courte (« 2850.5 »). */
export function rateText(value: { toFixed: () => string }): string {
  const parsed = parseRate(value.toFixed());
  return parsed.ok ? parsed.rate : value.toFixed();
}

export async function exchangeRateSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string },
  options: { latest?: number } = {},
): Promise<ExchangeRate[]> {
  const rows = await tx.exchangeRate.findMany({
    where: { ...where, establishmentId },
    orderBy: { effectiveAt: "desc" },
    ...(options.latest ? { take: options.latest } : {}),
  });
  const names = await userNames(
    tx,
    rows.map((row) => row.enteredBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    rate: rateText(row.rate),
    effectiveAt: row.effectiveAt.toISOString(),
    enteredBy: row.enteredBy,
    enteredByName: names.get(row.enteredBy) ?? "",
  }));
}

/** Paiements avec leurs affectations, le nom de la personne qui a encaissé et le code appareil. */
export async function paymentSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string | { in: string[] }; createdAt?: { gte: Date; lte?: Date } },
): Promise<Payment[]> {
  const rows = await tx.payment.findMany({ where: { ...where, establishmentId } });
  if (rows.length === 0) return [];
  const [allocations, devices, names] = await Promise.all([
    tx.paymentAllocation.findMany({
      where: { establishmentId, paymentId: { in: rows.map((row) => row.id) } },
    }),
    tx.device.findMany({
      where: { establishmentId, id: { in: [...new Set(rows.map((row) => row.deviceId))] } },
      select: { id: true, code: true },
    }),
    userNames(
      tx,
      rows.map((row) => row.collectedBy),
    ),
  ]);
  const deviceCode = new Map(devices.map((device) => [device.id, device.code]));
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    method: row.method as PaymentMethod,
    provider: row.provider as MobileMoneyProvider | null,
    reference: row.reference,
    tendered: money(row.amountMinor, row.currency),
    rate:
      row.exchangeRateId && row.rate ? { id: row.exchangeRateId, rate: rateText(row.rate) } : null,
    baseAmount: money(row.baseAmountMinor, row.baseCurrency),
    change: money(row.changeMinor, row.baseCurrency),
    allocations: allocations
      .filter((allocation) => allocation.paymentId === row.id)
      .map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amount: money(allocation.amountMinor, row.baseCurrency),
      })),
    collectedBy: row.collectedBy,
    collectedByName: names.get(row.collectedBy) ?? "",
    deviceCode: deviceCode.get(row.deviceId) ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

export function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Clôtures de caisse, avec les paiements couverts, le nom de la personne et le code appareil. */
export async function cashClosingSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string; day?: string; declaredAt?: { gte: Date } },
): Promise<CashClosing[]> {
  const rows = await tx.cashClosing.findMany({
    where: { ...where, establishmentId },
    orderBy: { declaredAt: "asc" },
  });
  if (rows.length === 0) return [];
  const [links, devices, names] = await Promise.all([
    tx.cashClosingPayment.findMany({
      where: { establishmentId, closingId: { in: rows.map((row) => row.id) } },
    }),
    tx.device.findMany({
      where: { establishmentId, id: { in: [...new Set(rows.map((row) => row.deviceId))] } },
      select: { id: true, code: true },
    }),
    userNames(
      tx,
      rows.map((row) => row.userId),
    ),
  ]);
  const deviceCode = new Map(devices.map((device) => [device.id, device.code]));
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    day: row.day,
    userId: row.userId,
    userName: names.get(row.userId) ?? "",
    deviceCode: deviceCode.get(row.deviceId) ?? "",
    declaredAt: row.declaredAt.toISOString(),
    paymentIds: links.filter((link) => link.closingId === row.id).map((link) => link.paymentId),
    lines: jsonArray<CashClosingLine>(row.lines),
    byServicePoint: jsonArray<CashClosing["byServicePoint"][number]>(row.byServicePoint),
    unpaidInvoiceIds: jsonArray<string>(row.unpaidInvoiceIds),
    comment: row.comment,
  }));
}

export async function stockCountSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string; day?: string; countedAt?: { gte: Date } },
): Promise<StockCount[]> {
  const rows = await tx.stockCount.findMany({ where: { ...where, establishmentId } });
  const names = await userNames(
    tx,
    rows.map((row) => row.countedBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    day: row.day,
    servicePointId: row.servicePointId,
    countedAt: row.countedAt.toISOString(),
    countedBy: row.countedBy,
    countedByName: names.get(row.countedBy) ?? "",
    lines: jsonArray<StockCountLine>(row.lines),
    comment: row.comment,
  }));
}

export async function dayClosingSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string },
  options: { latest?: number } = {},
): Promise<DayClosing[]> {
  const rows = await tx.dayClosing.findMany({
    where: { ...where, establishmentId },
    orderBy: { validatedAt: "desc" },
    ...(options.latest ? { take: options.latest } : {}),
  });
  const names = await userNames(
    tx,
    rows.map((row) => row.validatedBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    day: row.day,
    validatedAt: row.validatedAt.toISOString(),
    validatedBy: row.validatedBy,
    validatedByName: names.get(row.validatedBy) ?? "",
    cashClosingIds: jsonArray<string>(row.cashClosingIds),
    stockCountIds: jsonArray<string>(row.stockCountIds),
    comment: row.comment,
  }));
}

/** Demandes d'annulation ou de remise, avec le nom du demandeur et le code appareil. */
export async function adjustmentRequestSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string | { in: string[] }; requestedAt?: { gte: Date } },
): Promise<AdjustmentRequest[]> {
  const rows = await tx.adjustmentRequest.findMany({ where: { ...where, establishmentId } });
  if (rows.length === 0) return [];
  const [devices, names, establishment] = await Promise.all([
    tx.device.findMany({
      where: { establishmentId, id: { in: [...new Set(rows.map((row) => row.deviceId))] } },
      select: { id: true, code: true },
    }),
    userNames(
      tx,
      rows.map((row) => row.requestedBy),
    ),
    tx.establishment.findUnique({ where: { id: establishmentId }, select: { baseCurrency: true } }),
  ]);
  const deviceCode = new Map(devices.map((device) => [device.id, device.code]));
  const currency = establishment?.baseCurrency ?? "CDF";
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    kind: row.kind as AdjustmentKind,
    orderId: row.orderId,
    invoiceIds: jsonArray<string>(row.invoiceIds),
    reason: row.reason,
    discount: row.discountMinor === null ? null : money(row.discountMinor, currency),
    customerId: row.customerId,
    requestedBy: row.requestedBy,
    requestedByName: names.get(row.requestedBy) ?? "",
    requestedAt: row.requestedAt.toISOString(),
    deviceCode: deviceCode.get(row.deviceId) ?? "",
  }));
}

export async function adjustmentDecisionSnapshots(
  tx: Tx,
  establishmentId: string,
  where: { id?: string; requestId?: { in: string[] } },
): Promise<AdjustmentDecision[]> {
  const rows = await tx.adjustmentDecision.findMany({ where: { ...where, establishmentId } });
  const names = await userNames(
    tx,
    rows.map((row) => row.decidedBy),
  );
  return rows.map((row) => ({
    id: row.id,
    establishmentId: row.establishmentId,
    requestId: row.requestId,
    approved: row.approved,
    comment: row.comment,
    discounts: jsonArray<PaymentAllocation>(row.discounts),
    decidedBy: row.decidedBy,
    decidedByName: names.get(row.decidedBy) ?? "",
    decidedAt: row.decidedAt.toISOString(),
  }));
}

/** Fiche client, telle que l'appareil la conserve (D-059). */
export function customerSnapshot(
  row: {
    id: string;
    establishmentId: string;
    name: string;
    phone: string;
    creditLimitMinor: bigint | null;
    createdBy: string;
    createdAt: Date;
  },
  currency: string,
): Customer {
  return {
    id: row.id,
    establishmentId: row.establishmentId,
    name: row.name,
    phone: row.phone,
    creditLimit: row.creditLimitMinor === null ? null : money(row.creditLimitMinor, currency),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
