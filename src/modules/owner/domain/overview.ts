import { formatTime, localDayKey } from "@/shared/lib/dates";
import { addMoney, averageMoney, zero, type Currency, type Money } from "@/shared/lib/money";

import { businessDayStart } from "@/modules/restaurant";

/**
 * Vue d'ensemble du propriétaire (EF-PRO-01, EF-PRO-02) : chiffres de ventes
 * par établissement et au total, sur une période et la période précédente de
 * même durée. Fonctions pures : la base est lue par le service serveur.
 *
 * Les jours suivent la journée d'exploitation de chaque établissement
 * (HYPOTHÈSE D-Q10 : 6 h à 6 h), comme son propre tableau de bord.
 */

export const OVERVIEW_PERIODS = ["jour", "semaine", "mois"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export const PERIOD_LABELS: Record<OverviewPeriod, string> = {
  jour: "Aujourd'hui",
  semaine: "7 derniers jours",
  mois: "30 derniers jours",
};

const PERIOD_DAYS: Record<OverviewPeriod, number> = { jour: 1, semaine: 7, mois: 30 };
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function parsePeriod(value: string | undefined | null): OverviewPeriod {
  return (OVERVIEW_PERIODS as readonly string[]).includes(value ?? "")
    ? (value as OverviewPeriod)
    : "jour";
}

export type PeriodRange = {
  /** Début inclus de la période (ISO UTC). */
  start: string;
  /** Fin exclue : la fin de la journée d'exploitation en cours. */
  end: string;
  previousStart: string;
};

/** Période glissante qui se termine avec la journée d'exploitation en cours. */
export function periodRange(period: OverviewPeriod, nowIso: string, timeZone: string): PeriodRange {
  const todayStart = new Date(businessDayStart(nowIso, undefined, timeZone)).getTime();
  const days = PERIOD_DAYS[period];
  const start = todayStart - (days - 1) * DAY_MS;
  return {
    start: new Date(start).toISOString(),
    end: new Date(todayStart + DAY_MS).toISOString(),
    previousStart: new Date(start - days * DAY_MS).toISOString(),
  };
}

export type SaleRow = {
  establishmentId: string;
  createdAt: string;
  totalMinor: number;
  currency: Currency;
};

export type OrderRow = { establishmentId: string; createdAt: string };

export type EstablishmentRef = { id: string; timeZone: string; currency: Currency };

export type SeriesPoint = { key: string; label: string; value: Money };

export type EstablishmentSales = {
  establishmentId: string;
  revenue: Money;
  previousRevenue: Money;
  invoices: number;
  orders: number;
  averageOrder: Money;
  series: SeriesPoint[];
};

function inRange(iso: string, from: string, to: string): boolean {
  return iso >= from && iso < to;
}

/** Créneaux du graphique : heures de la journée, ou jours de la période. */
function buckets(period: OverviewPeriod, range: PeriodRange, timeZone: string) {
  const start = new Date(range.start).getTime();
  if (period === "jour") {
    return Array.from({ length: 24 }, (_, index) => {
      const from = new Date(start + index * HOUR_MS).toISOString();
      return {
        key: from,
        label: formatTime(from, timeZone),
        from,
        to: new Date(start + (index + 1) * HOUR_MS).toISOString(),
      };
    });
  }
  return Array.from({ length: PERIOD_DAYS[period] }, (_, index) => {
    const from = new Date(start + index * DAY_MS).toISOString();
    const day = localDayKey(from, timeZone);
    return {
      key: day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      from,
      to: new Date(start + (index + 1) * DAY_MS).toISOString(),
    };
  });
}

export function summarizeEstablishment(input: {
  establishment: EstablishmentRef;
  period: OverviewPeriod;
  nowIso: string;
  sales: readonly SaleRow[];
  orders: readonly OrderRow[];
}): EstablishmentSales {
  const { establishment, period, nowIso } = input;
  const range = periodRange(period, nowIso, establishment.timeZone);
  // Une seule devise par établissement (RG-ETB-01) : les autres sont ignorées.
  const own = input.sales.filter(
    (sale) => sale.establishmentId === establishment.id && sale.currency === establishment.currency,
  );
  const current = own.filter((sale) => inRange(sale.createdAt, range.start, range.end));
  const previous = own.filter((sale) => inRange(sale.createdAt, range.previousStart, range.start));
  const sum = (rows: readonly SaleRow[]) =>
    rows.reduce(
      (total, sale) => addMoney(total, { amountMinor: sale.totalMinor, currency: sale.currency }),
      zero(establishment.currency),
    );
  const revenue = sum(current);
  const orders = input.orders.filter(
    (order) =>
      order.establishmentId === establishment.id &&
      inRange(order.createdAt, range.start, range.end),
  ).length;

  return {
    establishmentId: establishment.id,
    revenue,
    previousRevenue: sum(previous),
    invoices: current.length,
    orders,
    averageOrder: averageMoney(revenue, orders),
    series: buckets(period, range, establishment.timeZone).map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: sum(current.filter((sale) => inRange(sale.createdAt, bucket.from, bucket.to))),
    })),
  };
}

/** Totaux par devise : on n'additionne jamais des francs et des dollars. */
export function totalsByCurrency(
  summaries: readonly EstablishmentSales[],
): { currency: Currency; revenue: Money; previousRevenue: Money; orders: number }[] {
  const totals = new Map<
    Currency,
    { currency: Currency; revenue: Money; previousRevenue: Money; orders: number }
  >();
  for (const summary of summaries) {
    const currency = summary.revenue.currency;
    const total = totals.get(currency) ?? {
      currency,
      revenue: zero(currency),
      previousRevenue: zero(currency),
      orders: 0,
    };
    totals.set(currency, {
      currency,
      revenue: addMoney(total.revenue, summary.revenue),
      previousRevenue: addMoney(total.previousRevenue, summary.previousRevenue),
      orders: total.orders + summary.orders,
    });
  }
  return [...totals.values()];
}

/** Évolution en pourcentage, ou `null` sans base de comparaison. */
export function evolution(current: Money, previous: Money): number | null {
  if (previous.amountMinor === 0) return null;
  return Math.round(((current.amountMinor - previous.amountMinor) / previous.amountMinor) * 100);
}
