import {
  addMoney,
  moneyFromMinor,
  subtractMoney,
  zero,
  type Currency,
  type Money,
} from "@/shared/lib/money";

import type {
  AdvanceInvoice,
  MobileMoneyProvider,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentStatus,
} from "./types";

/**
 * Encaissement du restaurant (EF-ENC-01 à 04, D-032, D-033, D-042).
 *
 * Le taux de change s'écrit « 1 USD = X CDF », quelle que soit la devise de
 * base : c'est ainsi que le gérant le lit au marché. Il est manipulé en
 * millionièmes entiers (6 décimales, comme `NUMERIC(18,6)` en base), jamais
 * en flottant (CLAUDE.md § 3.8).
 */

const RATE_SCALE = 1_000_000n;
const RATE_PATTERN = /^(\d{1,7})(?:\.(\d{1,6}))?$/;
export const MIN_RATE = 1;
export const MAX_RATE = 1_000_000;

export type RateParse = { ok: true; rate: string; micro: bigint } | { ok: false; message: string };

/**
 * Lit un taux saisi (« 2850 », « 2 850 », « 2850,5 »). Renvoie sa forme
 * normalisée (« 2850.5 ») ou un message qui dit quoi corriger.
 */
export function parseRate(input: string): RateParse {
  // `\s` couvre aussi les espaces insécables du séparateur de milliers français.
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const match = RATE_PATTERN.exec(normalized);
  if (!match) {
    return {
      ok: false,
      message: "Saisissez le taux en chiffres, par exemple 2850 ou 2850,50 (6 décimales au plus).",
    };
  }
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  const micro = BigInt(whole) * RATE_SCALE + BigInt((fraction || "0").padEnd(6, "0"));
  if (micro < BigInt(MIN_RATE) * RATE_SCALE || micro > BigInt(MAX_RATE) * RATE_SCALE) {
    return {
      ok: false,
      message: `Le taux doit être compris entre ${MIN_RATE} et ${MAX_RATE.toLocaleString("fr-FR")} francs pour 1 dollar.`,
    };
  }
  const rate = `${BigInt(whole).toString()}${fraction ? `.${fraction}` : ""}`;
  return { ok: true, rate, micro };
}

function rateMicro(rate: string): bigint {
  const parsed = parseRate(rate);
  if (!parsed.ok) throw new Error(`Taux invalide : ${rate}.`);
  return parsed.micro;
}

/** Division entière arrondie au plus proche (n ≥ 0, d > 0). */
function divRound(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (2n * d);
}

/** Division entière arrondie vers le haut (n ≥ 0, d > 0). */
function divCeil(n: bigint, d: bigint): bigint {
  return (n + d - 1n) / d;
}

function toMoney(value: bigint, currency: Currency): Money {
  return moneyFromMinor(Number(value), currency);
}

/**
 * Contre-valeur d'un montant dans une autre devise, au taux donné, arrondie
 * à l'unité minimale la plus proche. CDF et USD ont tous deux deux décimales
 * (ISO 4217), d'où un simple produit par le taux.
 */
export function convertMoney(amount: Money, to: Currency, rate: string): Money {
  if (amount.currency === to) return amount;
  const minor = BigInt(amount.amountMinor);
  const micro = rateMicro(rate);
  if (minor < 0n) throw new Error("Montant négatif : conversion impossible.");
  return amount.currency === "USD"
    ? toMoney(divRound(minor * micro, RATE_SCALE), to)
    : toMoney(divRound(minor * RATE_SCALE, micro), to);
}

/**
 * Plus petit montant dans la devise `currency` qui couvre `due` (devise de
 * base) : montant à demander au client qui paie en dollars, par exemple.
 */
export function minimumTendered(due: Money, currency: Currency, rate: string): Money {
  if (due.currency === currency) return due;
  const minor = BigInt(Math.max(0, due.amountMinor));
  const micro = rateMicro(rate);
  return currency === "USD"
    ? toMoney(divCeil(minor * RATE_SCALE, micro), currency)
    : toMoney(divCeil(minor * micro, RATE_SCALE), currency);
}

/**
 * Écart d'arrondi toléré pour une conversion : la contre-valeur d'une unité
 * minimale de la devise étrangère (1 centime de dollar ≈ 28,50 FC à 2 850).
 * En deçà, un paiement Mobile Money qui dépasse à peine le dû est accepté
 * sans « monnaie » à rendre.
 */
export function conversionTolerance(foreign: Currency, base: Currency, rate: string): Money {
  if (foreign === base) return zero(base);
  const micro = rateMicro(rate);
  return foreign === "USD"
    ? toMoney(divCeil(micro, RATE_SCALE), base)
    : toMoney(divCeil(RATE_SCALE, micro), base);
}

export type PaymentIssueCode =
  "AMOUNT_REQUIRED" | "NOTHING_DUE" | "RATE_REQUIRED" | "MORE_THAN_DUE" | "PROVIDER_REQUIRED";

export const PAYMENT_ISSUE_MESSAGES: Record<PaymentIssueCode, string> = {
  AMOUNT_REQUIRED: "Saisissez le montant reçu.",
  NOTHING_DUE: "Ces factures sont déjà payées.",
  RATE_REQUIRED:
    "Le gérant n'a pas encore saisi le taux du dollar : encaissez en francs ou demandez-lui de le saisir.",
  MORE_THAN_DUE:
    "Le montant dépasse le reste à payer : un paiement Mobile Money ne rend pas de monnaie.",
  PROVIDER_REQUIRED: "Choisissez l'opérateur Mobile Money.",
};

export type Settlement =
  | { ok: true; baseAmount: Money; change: Money; applied: Money }
  | { ok: false; code: PaymentIssueCode; message: string };

function issue(code: PaymentIssueCode): Settlement {
  return { ok: false, code, message: PAYMENT_ISSUE_MESSAGES[code] };
}

/**
 * Règlement d'un montant reçu face au reste à payer (EF-ENC-02) :
 * - en espèces, l'excédent est rendu en monnaie, dans la devise de base ;
 * - en Mobile Money, pas de monnaie : le montant ne dépasse pas le dû, à
 *   l'arrondi de conversion près ;
 * - un montant inférieur au dû est un paiement partiel.
 */
export function settlePayment(input: {
  due: Money;
  tendered: Money;
  method: PaymentMethod;
  rate: string | null;
}): Settlement {
  const base = input.due.currency;
  if (input.tendered.amountMinor <= 0) return issue("AMOUNT_REQUIRED");
  if (input.due.amountMinor <= 0) return issue("NOTHING_DUE");
  if (input.tendered.currency !== base && input.rate === null) return issue("RATE_REQUIRED");

  const baseAmount =
    input.tendered.currency === base
      ? input.tendered
      : convertMoney(input.tendered, base, input.rate ?? "1");
  if (baseAmount.amountMinor <= input.due.amountMinor) {
    return { ok: true, baseAmount, change: zero(base), applied: baseAmount };
  }
  const excess = subtractMoney(baseAmount, input.due);
  if (input.method === "cash") {
    return { ok: true, baseAmount, change: excess, applied: input.due };
  }
  const tolerance =
    input.rate === null
      ? zero(base)
      : conversionTolerance(input.tendered.currency, base, input.rate);
  if (excess.amountMinor < tolerance.amountMinor) {
    return { ok: true, baseAmount, change: zero(base), applied: input.due };
  }
  return issue("MORE_THAN_DUE");
}

/**
 * Contrôle d'un paiement reçu d'un appareil (serveur) : le montant en devise
 * de base est recalculé à partir du taux enregistré, puis comparé aux
 * affectations et à la monnaie déclarées. Renvoie un message ou `null`.
 */
export function checkPaymentConsistency(input: {
  method: PaymentMethod;
  provider: MobileMoneyProvider | null;
  tendered: Money;
  baseAmount: Money;
  change: Money;
  allocated: Money;
  rate: string | null;
}): string | null {
  const base = input.baseAmount.currency;
  if (input.tendered.amountMinor <= 0) return "Le montant reçu doit être positif.";
  if (input.allocated.amountMinor <= 0) return "Le paiement n'est affecté à aucune facture.";
  if (input.change.amountMinor < 0) return "La monnaie rendue ne peut pas être négative.";
  if (input.method === "mobile-money" && input.provider === null) {
    return PAYMENT_ISSUE_MESSAGES.PROVIDER_REQUIRED;
  }
  if (input.method === "mobile-money" && input.change.amountMinor > 0) {
    return "Un paiement Mobile Money ne rend pas de monnaie.";
  }
  const rounding =
    input.baseAmount.amountMinor - input.change.amountMinor - input.allocated.amountMinor;
  if (rounding === 0) return null;
  const tolerance =
    input.rate === null || input.method === "cash"
      ? 0
      : conversionTolerance(input.tendered.currency, base, input.rate).amountMinor;
  if (rounding > 0 && rounding < tolerance) return null;
  return "Le montant reçu, la monnaie rendue et les factures réglées ne concordent pas.";
}

/**
 * Affecte le montant réglé aux factures, dans l'ordre donné (les plus
 * anciennes d'abord) : chaque facture est soldée avant de passer à la
 * suivante. Le reste éventuel d'un paiement partiel reste dû sur les
 * dernières factures.
 */
export function allocatePayment(
  applied: Money,
  invoices: readonly { id: string; remaining: Money }[],
): PaymentAllocation[] {
  const allocations: PaymentAllocation[] = [];
  let left = applied.amountMinor;
  for (const invoice of invoices) {
    if (left <= 0) break;
    const amount = Math.min(left, invoice.remaining.amountMinor);
    if (amount <= 0) continue;
    allocations.push({ invoiceId: invoice.id, amount: moneyFromMinor(amount, applied.currency) });
    left -= amount;
  }
  return allocations;
}

export type InvoiceBalance = {
  total: Money;
  paid: Money;
  /** Reste à payer, jamais négatif. */
  remaining: Money;
  /** Trop-perçu : deux appareils ont encaissé la même facture hors connexion. */
  overpaid: Money;
  status: PaymentStatus;
};

/**
 * Soldes des factures à partir des paiements (faits en ajout seul,
 * RG-OFF-03) : rien n'est écrasé, deux encaissements faits hors connexion
 * s'additionnent, et un trop-perçu reste visible.
 */
export function invoiceBalances(
  invoices: readonly Pick<AdvanceInvoice, "id" | "total" | "paymentStatus">[],
  payments: readonly Pick<Payment, "allocations">[],
): Map<string, InvoiceBalance> {
  const paidById = new Map<string, number>();
  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      paidById.set(
        allocation.invoiceId,
        (paidById.get(allocation.invoiceId) ?? 0) + allocation.amount.amountMinor,
      );
    }
  }
  const balances = new Map<string, InvoiceBalance>();
  for (const invoice of invoices) {
    const currency = invoice.total.currency;
    const paid = paidById.get(invoice.id) ?? 0;
    const total = invoice.total.amountMinor;
    const status: PaymentStatus =
      invoice.paymentStatus === "cancelled"
        ? "cancelled"
        : paid >= total
          ? "paid"
          : paid > 0
            ? "partial"
            : "unpaid";
    balances.set(invoice.id, {
      total: invoice.total,
      paid: moneyFromMinor(paid, currency),
      remaining: moneyFromMinor(status === "cancelled" ? 0 : Math.max(0, total - paid), currency),
      overpaid: moneyFromMinor(Math.max(0, paid - total), currency),
      status,
    });
  }
  return balances;
}

/** Reste à payer d'un ensemble de factures (addition d'une table, commande). */
export function remainingDue(
  invoiceIds: readonly string[],
  balances: ReadonlyMap<string, InvoiceBalance>,
  currency: Currency,
): Money {
  return invoiceIds.reduce(
    (sum, id) => addMoney(sum, balances.get(id)?.remaining ?? zero(currency)),
    zero(currency),
  );
}

/** Statut d'un ensemble de factures : la moins réglée l'emporte. */
export function combinedPaymentStatus(statuses: readonly PaymentStatus[]): PaymentStatus {
  const active = statuses.filter((status) => status !== "cancelled");
  if (active.length === 0) return "cancelled";
  if (active.every((status) => status === "paid")) return "paid";
  if (active.some((status) => status === "paid" || status === "partial")) return "partial";
  return "unpaid";
}

export type HoldingBucket = {
  key: string;
  method: PaymentMethod;
  provider: MobileMoneyProvider | null;
  amount: Money;
  payments: number;
};

const PROVIDER_ORDER: readonly MobileMoneyProvider[] = ["mpesa", "orange-money", "airtel-money"];

/**
 * Argent détenu, par mode de paiement (EF-ENC-04) : espèces dans chaque
 * devise, la monnaie rendue étant retirée des espèces en devise de base,
 * puis Mobile Money par opérateur et par devise.
 */
export function holdingsByMode(
  payments: readonly Pick<Payment, "method" | "provider" | "tendered" | "change">[],
  base: Currency,
): HoldingBucket[] {
  const buckets = new Map<string, HoldingBucket>();
  const bucket = (
    method: PaymentMethod,
    provider: MobileMoneyProvider | null,
    currency: Currency,
  ) => {
    const key = `${method}:${provider ?? ""}:${currency}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = { key, method, provider, amount: zero(currency), payments: 0 };
      buckets.set(key, entry);
    }
    return entry;
  };
  for (const payment of payments) {
    const entry = bucket(payment.method, payment.provider, payment.tendered.currency);
    entry.amount = addMoney(entry.amount, payment.tendered);
    entry.payments += 1;
    if (payment.change.amountMinor > 0) {
      const cash = bucket("cash", null, base);
      cash.amount = subtractMoney(cash.amount, payment.change);
    }
  }
  const rank = (entry: HoldingBucket) =>
    (entry.method === "cash" ? 0 : 10 + PROVIDER_ORDER.indexOf(entry.provider ?? "mpesa") * 2) +
    (entry.amount.currency === base ? 0 : 1);
  return [...buckets.values()].sort((a, b) => rank(a) - rank(b));
}

/** Montant encaissé en devise de base : reçu moins monnaie rendue. */
export function collectedAmount(
  payments: readonly Pick<Payment, "baseAmount" | "change">[],
  base: Currency,
): Money {
  return payments.reduce(
    (sum, payment) => addMoney(sum, subtractMoney(payment.baseAmount, payment.change)),
    zero(base),
  );
}
