import { moneyFromMinor, zero, type Currency, type Money } from "@/shared/lib/money";

import { nextDayKey } from "./business-day";
import type { SaleUnit } from "./types";

/**
 * Clôture de période (EF-CLO-05) et écritures d'ajustement (RG-CLO-02),
 * D-064. Une période regroupe des journées validées consécutives choisies
 * par le gérant ; son résumé est figé à la validation. Une erreur dans une
 * journée validée se corrige par une écriture datée et motivée, jamais en
 * modifiant la clôture : caisse (montant attribué à une personne) ou stock
 * (correction du stock compté d'un élément).
 */

export const MIN_ADJUSTMENT_REASON = 3;
/** Garde-fou de saisie : une période de plus de 92 jours est sans doute une erreur. */
export const MAX_PERIOD_DAYS = 92;

export type Issue = { code: string; message: string };

/** Jours `AAAA-MM-JJ` de `from` à `to`, bornes comprises. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length <= MAX_PERIOD_DAYS; day = nextDayKey(day)) {
    days.push(day);
  }
  return days;
}

/** `2026-11-06` devient « 06/11/2026 ». */
export function formatDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Contrôles avant de valider une période. */
export function periodIssue(input: {
  from: string;
  to: string;
  /** Journées validées de l'établissement. */
  validatedDays: ReadonlySet<string>;
  /** Journées qui ont eu de l'activité (ventes ou stock du matin). */
  activeDays: ReadonlySet<string>;
  /** Périodes déjà clôturées. */
  periods: readonly { fromDay: string; toDay: string }[];
}): Issue | null {
  const { from, to } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { code: "INVALID_RANGE", message: "Choisissez une première et une dernière journée." };
  }
  const days = daysBetween(from, to);
  if (days.length > MAX_PERIOD_DAYS) {
    return {
      code: "PERIOD_TOO_LONG",
      message: `Une période compte ${MAX_PERIOD_DAYS} journées au plus.`,
    };
  }
  const overlap = input.periods.find((period) => period.fromDay <= to && from <= period.toDay);
  if (overlap) {
    return {
      code: "PERIOD_OVERLAP",
      message: `Ces journées recoupent la période déjà clôturée du ${formatDay(overlap.fromDay)} au ${formatDay(overlap.toDay)}.`,
    };
  }
  // Une journée sans aucune activité (restaurant fermé) n'a pas à être validée.
  const missing = days.filter((day) => input.activeDays.has(day) && !input.validatedDays.has(day));
  if (missing.length > 0) {
    return {
      code: "DAY_NOT_VALIDATED",
      message: `Validez d'abord ${missing.length > 1 ? "les journées" : "la journée"} du ${missing.map(formatDay).join(", ")}.`,
    };
  }
  if (!days.some((day) => input.validatedDays.has(day))) {
    return { code: "EMPTY_PERIOD", message: "Aucune journée validée dans ces dates." };
  }
  return null;
}

/** Contrôles d'une écriture d'ajustement. */
export function adjustmentIssue(input: {
  day: string;
  reason: string;
  /** Montant (caisse) ou quantité (stock), signé, non nul. */
  value: number;
  validatedDays: ReadonlySet<string>;
  periods: readonly { fromDay: string; toDay: string }[];
}): Issue | null {
  if (!input.validatedDays.has(input.day)) {
    return {
      code: "DAY_NOT_VALIDATED",
      message:
        "Seule une journée validée se corrige par une écriture ; avant, corrigez la déclaration ou le comptage.",
    };
  }
  const period = input.periods.find(
    (entry) => entry.fromDay <= input.day && input.day <= entry.toDay,
  );
  if (period) {
    return {
      code: "PERIOD_CLOSED",
      message: `Cette journée appartient à la période clôturée du ${formatDay(period.fromDay)} au ${formatDay(period.toDay)} : elle ne se corrige plus.`,
    };
  }
  if (!Number.isInteger(input.value) || input.value === 0) {
    return { code: "INVALID_VALUE", message: "Indiquez une correction non nulle." };
  }
  if (input.reason.trim().length < MIN_ADJUSTMENT_REASON) {
    return {
      code: "REASON_REQUIRED",
      message: "Indiquez le motif de la correction (3 caractères au moins).",
    };
  }
  return null;
}

// ─── Résumé d'une période ──────────────────────────────────────────────────

export type PeriodCashClosing = {
  day: string;
  userId: string;
  userName: string;
  lines: { expected: Money; counted: Money }[];
};

export type PeriodStockLine = {
  day: string;
  servicePointId: string;
  servicePointName: string;
  menuItemId: string;
  name: string;
  unit: SaleUnit;
  morning: number | null;
  sold: number;
  declaredOut: number;
  counted: number;
};

export type PeriodInvoice = {
  day: string;
  total: Money;
  discount: Money;
  isCancelled: boolean;
};

export type CashAdjustmentEntry = {
  day: string;
  userId: string;
  userName: string;
  amount: Money;
};

export type StockAdjustmentEntry = {
  day: string;
  servicePointId: string;
  menuItemId: string;
  quantity: number;
};

export type PersonCash = {
  userId: string;
  userName: string;
  currency: Currency;
  expected: Money;
  counted: Money;
  /** Écritures d'ajustement de caisse (argent retrouvé : positif). */
  adjusted: Money;
  /** Compté + ajustements − attendu : négatif = manquant (RG-CLO-01). */
  variance: Money;
};

export type StockVariance = {
  servicePointName: string;
  name: string;
  unit: SaleUnit;
  sold: number;
  declaredOut: number;
  /** Compté − attendu, corrections comprises : négatif = manque. */
  variance: number;
};

export type PeriodSummary = {
  from: string;
  to: string;
  validatedDays: string[];
  currency: Currency;
  /** Ventes facturées (remises déduites, annulations exclues). */
  revenue: Money;
  discounts: Money;
  cancelled: { count: number; amount: Money };
  cash: { currency: Currency; expected: Money; counted: Money; adjusted: Money; variance: Money }[];
  people: PersonCash[];
  stock: StockVariance[];
  /** Dettes clients encore dues au moment de la clôture (D-063). */
  debtsOutstanding: Money;
  adjustmentCount: number;
  /** Ce que la période ne peut pas encore montrer, sans rien inventer. */
  pending: { label: string; needs: string }[];
};

export const PERIOD_PENDING = [
  { label: "Bénéfice", needs: "prix de revient (catalogue et achats)" },
  { label: "Dépenses", needs: "trésorerie" },
];

const add = (a: Money, b: Money): Money =>
  moneyFromMinor(a.amountMinor + b.amountMinor, a.currency);

/** Résumé figé d'une période : ventes, caisse, manquants nommés, stock, dettes. */
export function summarizePeriod(input: {
  from: string;
  to: string;
  currency: Currency;
  validatedDays: readonly string[];
  invoices: readonly PeriodInvoice[];
  cashClosings: readonly PeriodCashClosing[];
  stockLines: readonly PeriodStockLine[];
  cashAdjustments: readonly CashAdjustmentEntry[];
  stockAdjustments: readonly StockAdjustmentEntry[];
  debtsOutstanding: Money;
}): PeriodSummary {
  const inRange = (day: string) => input.from <= day && day <= input.to;
  const base = zero(input.currency);

  let revenue = base;
  let discounts = base;
  let cancelledAmount = base;
  let cancelledCount = 0;
  for (const invoice of input.invoices.filter((entry) => inRange(entry.day))) {
    if (invoice.isCancelled) {
      cancelledCount += 1;
      cancelledAmount = add(cancelledAmount, invoice.total);
      continue;
    }
    revenue = add(
      revenue,
      moneyFromMinor(invoice.total.amountMinor - invoice.discount.amountMinor, input.currency),
    );
    discounts = add(discounts, invoice.discount);
  }

  // Caisse par personne et par devise (RG-CLO-01 : chaque écart est nommé).
  const people = new Map<string, PersonCash>();
  const person = (userId: string, userName: string, currency: Currency): PersonCash => {
    const key = `${userId}:${currency}`;
    const existing = people.get(key);
    if (existing) return existing;
    const created: PersonCash = {
      userId,
      userName,
      currency,
      expected: zero(currency),
      counted: zero(currency),
      adjusted: zero(currency),
      variance: zero(currency),
    };
    people.set(key, created);
    return created;
  };
  for (const closing of input.cashClosings.filter((entry) => inRange(entry.day))) {
    for (const line of closing.lines) {
      const entry = person(closing.userId, closing.userName, line.expected.currency);
      entry.expected = add(entry.expected, line.expected);
      entry.counted = add(entry.counted, line.counted);
    }
  }
  for (const adjustment of input.cashAdjustments.filter((entry) => inRange(entry.day))) {
    const entry = person(adjustment.userId, adjustment.userName, adjustment.amount.currency);
    entry.adjusted = add(entry.adjusted, adjustment.amount);
  }
  const peopleList = [...people.values()]
    .map((entry) => ({
      ...entry,
      variance: moneyFromMinor(
        entry.counted.amountMinor + entry.adjusted.amountMinor - entry.expected.amountMinor,
        entry.currency,
      ),
    }))
    .sort(
      (a, b) =>
        a.variance.amountMinor - b.variance.amountMinor ||
        a.userName.localeCompare(b.userName, "fr"),
    );

  const cashByCurrency = new Map<Currency, PeriodSummary["cash"][number]>();
  for (const entry of peopleList) {
    const current = cashByCurrency.get(entry.currency) ?? {
      currency: entry.currency,
      expected: zero(entry.currency),
      counted: zero(entry.currency),
      adjusted: zero(entry.currency),
      variance: zero(entry.currency),
    };
    cashByCurrency.set(entry.currency, {
      currency: entry.currency,
      expected: add(current.expected, entry.expected),
      counted: add(current.counted, entry.counted),
      adjusted: add(current.adjusted, entry.adjusted),
      variance: add(current.variance, entry.variance),
    });
  }

  // Stock : attendu = matin − ventes − sorties déclarées ; écart = compté − attendu.
  const stock = new Map<string, StockVariance>();
  for (const line of input.stockLines.filter((entry) => inRange(entry.day))) {
    if (line.morning === null) continue;
    const key = `${line.servicePointId}:${line.menuItemId}`;
    const current = stock.get(key) ?? {
      servicePointName: line.servicePointName,
      name: line.name,
      unit: line.unit,
      sold: 0,
      declaredOut: 0,
      variance: 0,
    };
    current.sold += line.sold;
    current.declaredOut += line.declaredOut;
    current.variance += line.counted - (line.morning - line.sold - line.declaredOut);
    stock.set(key, current);
  }
  for (const adjustment of input.stockAdjustments.filter((entry) => inRange(entry.day))) {
    const current = stock.get(`${adjustment.servicePointId}:${adjustment.menuItemId}`);
    if (current) current.variance += adjustment.quantity;
  }

  return {
    from: input.from,
    to: input.to,
    validatedDays: input.validatedDays.filter(inRange).sort(),
    currency: input.currency,
    revenue,
    discounts,
    cancelled: { count: cancelledCount, amount: cancelledAmount },
    cash: [...cashByCurrency.values()],
    people: peopleList,
    stock: [...stock.values()]
      .filter((entry) => entry.variance !== 0 || entry.declaredOut > 0)
      .sort((a, b) => a.variance - b.variance || a.name.localeCompare(b.name, "fr")),
    debtsOutstanding: input.debtsOutstanding,
    adjustmentCount:
      input.cashAdjustments.filter((entry) => inRange(entry.day)).length +
      input.stockAdjustments.filter((entry) => inRange(entry.day)).length,
    pending: PERIOD_PENDING,
  };
}
