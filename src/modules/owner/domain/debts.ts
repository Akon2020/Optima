import { moneyFromMinor, zero, type Currency, type Money } from "@/shared/lib/money";

/**
 * Dettes clients dans la vue d'ensemble du propriétaire (EF-PRO-01,
 * EF-TRE-03, D-059, D-063). Une dette est une vente à crédit validée par le
 * gérant ; son reste est celui de ses factures : total − remise − paiements
 * reçus. C'est un état à l'instant présent, pas une somme sur la période.
 */

/** Une facture mise à crédit, telle que la lit le serveur. */
export type CreditInvoiceRow = {
  establishmentId: string;
  /** Demande de crédit validée : une dette. */
  requestId: string;
  customerId: string;
  /** Date de la validation par le gérant (début de la dette). */
  decidedAt: string;
  currency: Currency;
  totalMinor: number;
  discountMinor: number;
  paidMinor: number;
};

export type Debtor = {
  establishmentId: string;
  customerId: string;
  name: string;
  remaining: Money;
  /** Ancienneté de sa plus vieille dette ouverte, en jours entiers. */
  oldestDays: number;
};

export type EstablishmentDebts = {
  /** Encours total, dans la devise de l'établissement. */
  outstanding: Money;
  /** Dettes encore ouvertes (reste à payer non nul). */
  openDebts: number;
  debtors: Debtor[];
  /** Ancienneté de la plus vieille dette ouverte ; `null` sans dette. */
  oldestDays: number | null;
};

const DAY_MS = 86_400_000;

function ageDays(fromIso: string, nowIso: string): number {
  return Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(fromIso)) / DAY_MS));
}

/** Dettes d'un établissement : encours, dettes ouvertes, débiteurs du plus endetté au moins. */
export function summarizeDebts(input: {
  establishmentId: string;
  currency: Currency;
  rows: readonly CreditInvoiceRow[];
  customerNames: ReadonlyMap<string, string>;
  nowIso: string;
}): EstablishmentDebts {
  const own = input.rows.filter(
    (row) => row.establishmentId === input.establishmentId && row.currency === input.currency,
  );
  const byDebt = new Map<string, { customerId: string; decidedAt: string; remaining: number }>();
  for (const row of own) {
    const left = Math.max(0, row.totalMinor - row.discountMinor - row.paidMinor);
    const debt = byDebt.get(row.requestId) ?? {
      customerId: row.customerId,
      decidedAt: row.decidedAt,
      remaining: 0,
    };
    debt.remaining += left;
    byDebt.set(row.requestId, debt);
  }
  const open = [...byDebt.values()].filter((debt) => debt.remaining > 0);

  const byCustomer = new Map<string, { remaining: number; oldest: string }>();
  for (const debt of open) {
    const entry = byCustomer.get(debt.customerId);
    if (!entry) {
      byCustomer.set(debt.customerId, { remaining: debt.remaining, oldest: debt.decidedAt });
    } else {
      entry.remaining += debt.remaining;
      if (debt.decidedAt < entry.oldest) entry.oldest = debt.decidedAt;
    }
  }
  const debtors = [...byCustomer.entries()]
    .map(([customerId, entry]): Debtor => ({
      establishmentId: input.establishmentId,
      customerId,
      name: input.customerNames.get(customerId) ?? "",
      remaining: moneyFromMinor(entry.remaining, input.currency),
      oldestDays: ageDays(entry.oldest, input.nowIso),
    }))
    .sort(
      (a, b) => b.remaining.amountMinor - a.remaining.amountMinor || b.oldestDays - a.oldestDays,
    );

  return {
    outstanding: moneyFromMinor(
      open.reduce((sum, debt) => sum + debt.remaining, 0),
      input.currency,
    ),
    openDebts: open.length,
    debtors,
    oldestDays: debtors.length > 0 ? Math.max(...debtors.map((debtor) => debtor.oldestDays)) : null,
  };
}

/** Encours de tous les établissements, par devise (jamais additionnées entre elles). */
export function debtTotals(
  list: readonly Pick<EstablishmentDebts, "outstanding" | "debtors">[],
): { currency: Currency; outstanding: Money; debtors: number }[] {
  const byCurrency = new Map<Currency, { outstanding: Money; debtors: number }>();
  for (const entry of list) {
    if (entry.outstanding.amountMinor === 0) continue;
    const currency = entry.outstanding.currency;
    const current = byCurrency.get(currency) ?? { outstanding: zero(currency), debtors: 0 };
    byCurrency.set(currency, {
      outstanding: moneyFromMinor(
        current.outstanding.amountMinor + entry.outstanding.amountMinor,
        currency,
      ),
      debtors: current.debtors + entry.debtors.length,
    });
  }
  return [...byCurrency.entries()].map(([currency, value]) => ({ currency, ...value }));
}
