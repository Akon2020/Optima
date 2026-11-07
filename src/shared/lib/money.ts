/**
 * Montants (CLAUDE.md § 3.8 et § 3.14).
 *
 * Un montant est toujours un entier exprimé dans l'unité minimale de sa
 * devise (exposant ISO 4217 : 2 pour CDF et USD), jamais un flottant.
 * Toute création, addition, multiplication et tout formatage passent par ce
 * fichier.
 */

export const CURRENCIES = ["CDF", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Money = {
  readonly amountMinor: number;
  readonly currency: Currency;
};

const MINOR_EXPONENT: Record<Currency, number> = { CDF: 2, USD: 2 };

export class MoneyError extends Error {
  override name = "MoneyError";
}

function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Montant invalide : ${value} n'est pas un entier sûr.`);
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Devises différentes : ${a.currency} et ${b.currency}.`);
  }
}

/** Crée un montant à partir de son unité minimale (ex. centimes). */
export function moneyFromMinor(amountMinor: number, currency: Currency): Money {
  assertSafeInteger(amountMinor);
  return { amountMinor, currency };
}

/**
 * Crée un montant à partir d'une valeur saisie en unité principale
 * (ex. 2 500 FC). La valeur est arrondie à l'unité minimale la plus proche.
 */
export function moneyFromMajor(amountMajor: number, currency: Currency): Money {
  if (!Number.isFinite(amountMajor)) {
    throw new MoneyError(`Montant invalide : ${amountMajor}.`);
  }
  const factor = 10 ** MINOR_EXPONENT[currency];
  return moneyFromMinor(Math.round(amountMajor * factor), currency);
}

export function zero(currency: Currency): Money {
  return { amountMinor: 0, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return moneyFromMinor(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return moneyFromMinor(a.amountMinor - b.amountMinor, a.currency);
}

/** Multiplie un prix unitaire par une quantité entière (bouteilles, plats, morceaux). */
export function multiplyMoney(unit: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`Quantité invalide : ${quantity}.`);
  }
  return moneyFromMinor(unit.amountMinor * quantity, unit.currency);
}

export function sumMoney(values: readonly Money[], currency: Currency): Money {
  return values.reduce<Money>((total, value) => addMoney(total, value), zero(currency));
}

export function toMajor(value: Money): number {
  return value.amountMinor / 10 ** MINOR_EXPONENT[value.currency];
}

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: Currency, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}-${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-CD", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Formate un montant en français (ENF-15) : séparateur de milliers, symbole
 * de la devise. Les décimales ne sont affichées que si le montant en a.
 */
export function formatMoney(value: Money): string {
  const exponent = MINOR_EXPONENT[value.currency];
  const hasFraction = value.amountMinor % 10 ** exponent !== 0;
  return getFormatter(value.currency, hasFraction ? exponent : 0)
    .format(toMajor(value))
    .replace(/ | /g, " ");
}

/** Format compact pour les axes de graphiques (ex. « 25 k »). */
export function formatCompactMajor(value: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
