import { moneyFromMinor, zero, type Currency, type Money } from "@/shared/lib/money";

import type { MobileMoneyProvider, PaymentMethod, SaleUnit } from "./types";

/**
 * Rapport des ventes d'une période (EF-RAP-01, D-065) : par point de
 * service, par serveur, par article (plus et moins vendus), par heure et par
 * mode de paiement. Fonctions pures. Une vente appartient à sa journée selon
 * D-039 ; les factures annulées sont comptées à part, jamais dans les ventes.
 * La marge (EF-RAP-02) attend les prix de revient.
 */

/** Nombre d'articles montrés parmi les plus et les moins vendus. */
export const TOP_ITEMS = 10;

export type ReportInvoice = {
  id: string;
  orderId: string;
  day: string;
  /** Heure locale (0 à 23) de la facture, dans le fuseau de l'établissement. */
  hour: number;
  /** `null` : frais de livraison, hors points de service (D-071). */
  servicePointId: string | null;
  waiterId: string;
  total: Money;
  discount: Money;
  isCancelled: boolean;
};

export type ReportLine = {
  invoiceId: string;
  menuItemId: string;
  quantity: number;
  lineTotal: Money;
};

export type ReportPayment = {
  method: PaymentMethod;
  provider: MobileMoneyProvider | null;
  /** Devise donnée par le client (espèces en francs ou en dollars). */
  tenderedCurrency: Currency;
  /** Montant encaissé, monnaie rendue déduite, en devise de base. */
  net: Money;
};

export type ReportItem = {
  id: string;
  name: string;
  servicePointId: string;
  unit: SaleUnit;
  /** Élément vendable aujourd'hui (prix fixé, non archivé) : candidat aux « moins vendus ». */
  isSellable: boolean;
};

export type SalesReport = {
  from: string;
  to: string;
  currency: Currency;
  /** Ventes nettes : totaux des factures non annulées, remises déduites. */
  revenue: Money;
  discounts: Money;
  invoices: number;
  orders: number;
  averageOrder: Money;
  cancelled: { count: number; amount: Money };
  byPoint: { id: string; name: string; revenue: Money; invoices: number; share: number }[];
  byWaiter: { id: string; name: string; orders: number; revenue: Money }[];
  /** Quantités et montants avant remises (une remise porte sur la facture, pas sur l'article). */
  byItem: {
    id: string;
    name: string;
    pointName: string;
    unit: SaleUnit;
    quantity: number;
    revenue: Money;
  }[];
  topItems: SalesReport["byItem"];
  bottomItems: SalesReport["byItem"];
  byHour: { hour: number; revenue: Money; orders: number }[];
  byMethod: { label: string; amount: Money }[];
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  "mobile-money": "Mobile Money",
};

const PROVIDER_LABELS: Record<MobileMoneyProvider, string> = {
  mpesa: "M-Pesa",
  "orange-money": "Orange Money",
  "airtel-money": "Airtel Money",
};

function paymentLabel(payment: ReportPayment): string {
  if (payment.method === "mobile-money") {
    return payment.provider
      ? `${METHOD_LABELS["mobile-money"]} · ${PROVIDER_LABELS[payment.provider]}`
      : METHOD_LABELS["mobile-money"];
  }
  return `${METHOD_LABELS.cash} (${payment.tenderedCurrency === "USD" ? "$" : "FC"})`;
}

const sum = (values: readonly Money[], currency: Currency): Money =>
  moneyFromMinor(
    values.reduce((total, value) => total + value.amountMinor, 0),
    currency,
  );

export function buildSalesReport(input: {
  from: string;
  to: string;
  currency: Currency;
  invoices: readonly ReportInvoice[];
  lines: readonly ReportLine[];
  payments: readonly ReportPayment[];
  items: readonly ReportItem[];
  servicePoints: readonly { id: string; name: string }[];
  waiterNames: ReadonlyMap<string, string>;
}): SalesReport {
  const { currency } = input;
  const inRange = (day: string) => input.from <= day && day <= input.to;
  const invoices = input.invoices.filter((invoice) => inRange(invoice.day));
  const active = invoices.filter((invoice) => !invoice.isCancelled);
  const cancelled = invoices.filter((invoice) => invoice.isCancelled);
  const net = (invoice: ReportInvoice) =>
    moneyFromMinor(invoice.total.amountMinor - invoice.discount.amountMinor, currency);

  const revenue = sum(active.map(net), currency);
  const orders = new Set(active.map((invoice) => invoice.orderId)).size;
  const pointName = new Map(input.servicePoints.map((point) => [point.id, point.name]));

  const byPoint = input.servicePoints
    .map((point) => {
      const own = active.filter((invoice) => invoice.servicePointId === point.id);
      const value = sum(own.map(net), currency);
      return {
        id: point.id,
        name: point.name,
        revenue: value,
        invoices: own.length,
        share: revenue.amountMinor > 0 ? value.amountMinor / revenue.amountMinor : 0,
      };
    })
    .filter((entry) => entry.invoices > 0);
  // D-071 : les frais de livraison reviennent au restaurant, hors points de service.
  const fees = active.filter((invoice) => invoice.servicePointId === null);
  if (fees.length > 0) {
    const value = sum(fees.map(net), currency);
    byPoint.push({
      id: "delivery-fees",
      name: "Frais de livraison",
      revenue: value,
      invoices: fees.length,
      share: revenue.amountMinor > 0 ? value.amountMinor / revenue.amountMinor : 0,
    });
  }

  const waiters = new Map<string, { orders: Set<string>; revenue: number }>();
  for (const invoice of active) {
    const entry = waiters.get(invoice.waiterId) ?? { orders: new Set<string>(), revenue: 0 };
    entry.orders.add(invoice.orderId);
    entry.revenue += net(invoice).amountMinor;
    waiters.set(invoice.waiterId, entry);
  }
  const byWaiter = [...waiters.entries()]
    .map(([id, entry]) => ({
      id,
      name: input.waiterNames.get(id) ?? "Sans nom",
      orders: entry.orders.size,
      revenue: moneyFromMinor(entry.revenue, currency),
    }))
    .sort(
      (a, b) => b.revenue.amountMinor - a.revenue.amountMinor || a.name.localeCompare(b.name, "fr"),
    );

  // Articles : lignes des factures non annulées de la période.
  const activeIds = new Set(active.map((invoice) => invoice.id));
  const sold = new Map<string, { quantity: number; revenue: number }>();
  for (const line of input.lines) {
    if (!activeIds.has(line.invoiceId)) continue;
    const entry = sold.get(line.menuItemId) ?? { quantity: 0, revenue: 0 };
    entry.quantity += line.quantity;
    entry.revenue += line.lineTotal.amountMinor;
    sold.set(line.menuItemId, entry);
  }
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const row = (id: string, quantity: number, revenueMinor: number) => {
    const item = itemById.get(id);
    return {
      id,
      name: item?.name ?? "Élément retiré",
      pointName: pointName.get(item?.servicePointId ?? "") ?? "",
      unit: item?.unit ?? "dish",
      quantity,
      revenue: moneyFromMinor(revenueMinor, currency),
    };
  };
  const byItem = [...sold.entries()]
    .map(([id, entry]) => row(id, entry.quantity, entry.revenue))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "fr"));
  // Moins vendus : tous les éléments vendables, y compris ceux qui ne se sont pas vendus.
  const bottomItems = input.items
    .filter((item) => item.isSellable)
    .map((item) => row(item.id, sold.get(item.id)?.quantity ?? 0, sold.get(item.id)?.revenue ?? 0))
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, "fr"))
    .slice(0, TOP_ITEMS);

  const hours = new Map<number, { revenue: number; orders: Set<string> }>();
  for (const invoice of active) {
    const entry = hours.get(invoice.hour) ?? { revenue: 0, orders: new Set<string>() };
    entry.revenue += net(invoice).amountMinor;
    entry.orders.add(invoice.orderId);
    hours.set(invoice.hour, entry);
  }
  const byHour = [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, entry]) => ({
      hour,
      revenue: moneyFromMinor(entry.revenue, currency),
      orders: entry.orders.size,
    }));

  const methods = new Map<string, number>();
  for (const payment of input.payments) {
    const label = paymentLabel(payment);
    methods.set(label, (methods.get(label) ?? 0) + payment.net.amountMinor);
  }

  return {
    from: input.from,
    to: input.to,
    currency,
    revenue,
    discounts: sum(
      active.map((invoice) => invoice.discount),
      currency,
    ),
    invoices: active.length,
    orders,
    averageOrder:
      orders > 0
        ? moneyFromMinor(Math.round(revenue.amountMinor / orders), currency)
        : zero(currency),
    cancelled: {
      count: cancelled.length,
      amount: sum(
        cancelled.map((invoice) => invoice.total),
        currency,
      ),
    },
    byPoint,
    byWaiter,
    byItem,
    topItems: byItem.slice(0, TOP_ITEMS),
    bottomItems,
    byHour,
    byMethod: [...methods.entries()]
      .map(([label, amount]) => ({ label, amount: moneyFromMinor(amount, currency) }))
      .sort((a, b) => b.amount.amountMinor - a.amount.amountMinor),
  };
}

/** Période par défaut : les 7 dernières journées, celle du jour comprise. */
export function defaultReportRange(today: string): { from: string; to: string } {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return { from: date.toISOString().slice(0, 10), to: today };
}
