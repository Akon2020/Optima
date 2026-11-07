import { orderPrepStatus } from "../../domain/dashboard";
import type { AdvanceInvoice, Order, PrepStatus, ServicePoint } from "../../domain/types";

export type OrderRow = {
  order: Order;
  invoices: AdvanceInvoice[];
  prepStatus: PrepStatus;
  servicePoints: ServicePoint[];
  isCancelled: boolean;
};

/** Associe chaque commande à ses factures d'avance et à son statut global. */
export function buildOrderRows(
  orders: readonly Order[],
  invoices: readonly AdvanceInvoice[],
  servicePoints: readonly ServicePoint[],
): OrderRow[] {
  const byOrder = new Map<string, AdvanceInvoice[]>();
  for (const invoice of invoices) {
    byOrder.set(invoice.orderId, [...(byOrder.get(invoice.orderId) ?? []), invoice]);
  }
  const pointById = new Map(servicePoints.map((point) => [point.id, point]));

  return orders.map((order) => {
    const orderInvoices = (byOrder.get(order.id) ?? []).sort(
      (a, b) =>
        (pointById.get(a.servicePointId)?.sortOrder ?? 0) -
        (pointById.get(b.servicePointId)?.sortOrder ?? 0),
    );
    const active = orderInvoices.filter((invoice) => invoice.paymentStatus !== "cancelled");
    return {
      order,
      invoices: orderInvoices,
      prepStatus: orderPrepStatus(active.map((invoice) => invoice.prepStatus)),
      servicePoints: orderInvoices
        .map((invoice) => pointById.get(invoice.servicePointId))
        .filter((point): point is ServicePoint => point !== undefined),
      isCancelled: orderInvoices.length > 0 && active.length === 0,
    };
  });
}

/** Résumé court des lignes : « 3× Primus 72 cl, 1× Frites… ». */
export function summarizeLines(order: Order, max = 2): string {
  const parts = order.lines.slice(0, max).map((line) => `${line.quantity}× ${line.name}`);
  const rest = order.lines.length - max;
  return rest > 0 ? `${parts.join(", ")} +${rest}` : parts.join(", ");
}
