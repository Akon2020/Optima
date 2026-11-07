import { addMoney, averageMoney, zero, type Currency, type Money } from "@/shared/lib/money";

import type { AdvanceInvoice, PrepStatus } from "./types";

const HOUR_MS = 3_600_000;

export type HourlyPoint = { hourStart: string; total: Money; invoices: number };

export type DaySummary = {
  billed: Money;
  invoiceCount: number;
  orderCount: number;
  averageOrder: Money;
  prepCounts: Record<PrepStatus, number>;
  unpaidCount: number;
  hourly: HourlyPoint[];
  byServicePoint: Map<string, { total: Money; invoices: number }>;
  byWaiter: Map<
    string,
    { name: string; total: Money; openOrders: Set<string>; orders: Set<string> }
  >;
  soldByItem: Map<string, number>;
};

/**
 * Synthèse de la journée à partir des factures d'avance (souches). Les
 * factures annulées sont exclues des montants (RG-CMD-02). Il s'agit du
 * montant facturé : l'encaissement dépend encore de D-Q03 et D-Q04.
 */
export function summarizeDay(
  invoices: readonly AdvanceInvoice[],
  dayStartIso: string,
  nowIso: string,
  currency: Currency,
): DaySummary {
  const start = new Date(dayStartIso).getTime();
  const now = new Date(nowIso).getTime();
  const hourCount = Math.max(1, Math.ceil((now - start) / HOUR_MS));
  const hourly: HourlyPoint[] = Array.from({ length: hourCount }, (_, index) => ({
    hourStart: new Date(start + index * HOUR_MS).toISOString(),
    total: zero(currency),
    invoices: 0,
  }));

  let billed = zero(currency);
  let invoiceCount = 0;
  let unpaidCount = 0;
  const orders = new Set<string>();
  const prepCounts: Record<PrepStatus, number> = { pending: 0, ready: 0, served: 0 };
  const byServicePoint: DaySummary["byServicePoint"] = new Map();
  const byWaiter: DaySummary["byWaiter"] = new Map();
  const soldByItem = new Map<string, number>();

  for (const invoice of invoices) {
    if (invoice.paymentStatus === "cancelled") continue;
    billed = addMoney(billed, invoice.total);
    invoiceCount += 1;
    orders.add(invoice.orderId);
    prepCounts[invoice.prepStatus] += 1;
    if (invoice.paymentStatus === "unpaid") unpaidCount += 1;

    const bucket = hourly[Math.floor((new Date(invoice.createdAt).getTime() - start) / HOUR_MS)];
    if (bucket) {
      bucket.total = addMoney(bucket.total, invoice.total);
      bucket.invoices += 1;
    }

    const point = byServicePoint.get(invoice.servicePointId) ?? {
      total: zero(currency),
      invoices: 0,
    };
    point.total = addMoney(point.total, invoice.total);
    point.invoices += 1;
    byServicePoint.set(invoice.servicePointId, point);

    const waiter = byWaiter.get(invoice.waiterId) ?? {
      name: invoice.waiterName,
      total: zero(currency),
      openOrders: new Set<string>(),
      orders: new Set<string>(),
    };
    waiter.total = addMoney(waiter.total, invoice.total);
    waiter.orders.add(invoice.orderId);
    if (invoice.prepStatus !== "served") waiter.openOrders.add(invoice.orderId);
    byWaiter.set(invoice.waiterId, waiter);

    for (const line of invoice.lines) {
      soldByItem.set(line.menuItemId, (soldByItem.get(line.menuItemId) ?? 0) + line.quantity);
    }
  }

  const averageOrder = averageMoney(billed, orders.size);

  return {
    billed,
    invoiceCount,
    orderCount: orders.size,
    averageOrder,
    prepCounts,
    unpaidCount,
    hourly,
    byServicePoint,
    byWaiter,
    soldByItem,
  };
}

/**
 * Statut d'une commande à partir de ses factures : la moins avancée l'emporte
 * (une commande n'est servie que si toutes ses factures le sont).
 */
export function orderPrepStatus(statuses: readonly PrepStatus[]): PrepStatus {
  if (statuses.length === 0 || statuses.includes("pending")) return "pending";
  if (statuses.includes("ready")) return "ready";
  return "served";
}
