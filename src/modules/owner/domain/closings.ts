import { localDayKey } from "@/shared/lib/dates";
import { addMoney, moneyFromMinor, zero, type Currency, type Money } from "@/shared/lib/money";

import type { PeriodRange } from "./overview";

/**
 * Clôtures dans l'espace propriétaire (EF-CLO-04, EF-PRO-01, RG-CLO-01,
 * D-056) : cash attendu, cash déclaré et manquants de la période, par devise,
 * chaque manquant rattaché à une personne nommée ; journées passées non
 * validées. Fonctions pures : la base est lue par le service serveur.
 */

export type ClosingLineRow = { expectedMinor: number; countedMinor: number; currency: Currency };

export type CashClosingRow = {
  establishmentId: string;
  day: string;
  userName: string;
  lines: ClosingLineRow[];
  comment: string | null;
};

export type CashSummary = {
  currency: Currency;
  expected: Money;
  counted: Money;
  /** Somme des manquants (compté sous l'attendu), sans compenser par les excédents. */
  shortage: Money;
};

export type Shortage = {
  establishmentId: string;
  day: string;
  userName: string;
  amount: Money;
  comment: string | null;
};

export type EstablishmentClosings = {
  cash: CashSummary[];
  shortages: Shortage[];
  validatedDays: number;
  /** Journées passées de la période, avec des ventes, que le gérant n'a pas validées. */
  unvalidatedDays: string[];
  lastValidatedDay: string | null;
};

const DAY_MS = 86_400_000;

/** Journées d'exploitation (clés `AAAA-MM-JJ`) couvertes par la période. */
export function periodDayKeys(
  range: Pick<PeriodRange, "start" | "end">,
  timeZone: string,
): string[] {
  const keys: string[] = [];
  for (let time = Date.parse(range.start); time < Date.parse(range.end); time += DAY_MS) {
    keys.push(localDayKey(new Date(time).toISOString(), timeZone));
  }
  return keys;
}

function addToSummary(summaries: Map<Currency, CashSummary>, line: ClosingLineRow): void {
  const entry = summaries.get(line.currency) ?? {
    currency: line.currency,
    expected: zero(line.currency),
    counted: zero(line.currency),
    shortage: zero(line.currency),
  };
  const missing = Math.max(0, line.expectedMinor - line.countedMinor);
  summaries.set(line.currency, {
    currency: line.currency,
    expected: addMoney(entry.expected, moneyFromMinor(line.expectedMinor, line.currency)),
    counted: addMoney(entry.counted, moneyFromMinor(line.countedMinor, line.currency)),
    shortage: addMoney(entry.shortage, moneyFromMinor(missing, line.currency)),
  });
}

/** Clôtures d'un établissement sur les journées de la période. */
export function summarizeClosings(input: {
  establishmentId: string;
  dayKeys: readonly string[];
  todayKey: string;
  cashClosings: readonly CashClosingRow[];
  validatedDays: readonly { establishmentId: string; day: string }[];
  /** Journées où l'établissement a vendu (une journée sans vente n'a rien à clôturer). */
  activeDays: ReadonlySet<string>;
  /**
   * Journées où chercher une validation manquante ; par défaut celles de la
   * période. Le service regarde toujours au moins les 7 derniers jours, pour
   * qu'une veille non validée soit signalée même sur la vue « Aujourd'hui ».
   */
  checkDays?: readonly string[];
  lastValidatedDay: string | null;
}): EstablishmentClosings {
  const inPeriod = new Set(input.dayKeys);
  const summaries = new Map<Currency, CashSummary>();
  const shortages: Shortage[] = [];
  for (const closing of input.cashClosings) {
    if (closing.establishmentId !== input.establishmentId || !inPeriod.has(closing.day)) continue;
    const missing = new Map<Currency, number>();
    for (const line of closing.lines) {
      addToSummary(summaries, line);
      const amount = line.expectedMinor - line.countedMinor;
      if (amount > 0) missing.set(line.currency, (missing.get(line.currency) ?? 0) + amount);
    }
    for (const [currency, amount] of missing) {
      shortages.push({
        establishmentId: closing.establishmentId,
        day: closing.day,
        userName: closing.userName,
        amount: moneyFromMinor(amount, currency),
        comment: closing.comment,
      });
    }
  }
  const validated = new Set(
    input.validatedDays
      .filter((entry) => entry.establishmentId === input.establishmentId)
      .map((entry) => entry.day),
  );
  return {
    cash: [...summaries.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    shortages: shortages.sort(
      (a, b) => b.day.localeCompare(a.day) || b.amount.amountMinor - a.amount.amountMinor,
    ),
    validatedDays: input.dayKeys.filter((day) => validated.has(day)).length,
    unvalidatedDays: (input.checkDays ?? input.dayKeys).filter(
      (day) => day < input.todayKey && input.activeDays.has(day) && !validated.has(day),
    ),
    lastValidatedDay: input.lastValidatedDay,
  };
}

/** Totaux de caisse par devise, tous établissements confondus (jamais de francs + dollars). */
export function cashTotals(closings: readonly EstablishmentClosings[]): CashSummary[] {
  const totals = new Map<Currency, CashSummary>();
  for (const entry of closings) {
    for (const summary of entry.cash) {
      const current = totals.get(summary.currency);
      totals.set(
        summary.currency,
        current
          ? {
              currency: summary.currency,
              expected: addMoney(current.expected, summary.expected),
              counted: addMoney(current.counted, summary.counted),
              shortage: addMoney(current.shortage, summary.shortage),
            }
          : summary,
      );
    }
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
