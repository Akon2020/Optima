import { subtractMoney, type Money } from "@/shared/lib/money";

export type CashVariance = {
  variance: Money;
  kind: "balanced" | "shortage" | "surplus";
  /** EF-CLO-02 : un commentaire est exigé dès que l'écart n'est pas nul. */
  requiresComment: boolean;
};

/**
 * Écart de caisse (EF-CLO-02) : montant compté moins montant attendu.
 * Négatif : manquant ; positif : excédent.
 */
export function computeCashVariance(expected: Money, counted: Money): CashVariance {
  const variance = subtractMoney(counted, expected);
  const kind =
    variance.amountMinor === 0 ? "balanced" : variance.amountMinor < 0 ? "shortage" : "surplus";
  return { variance, kind, requiresComment: kind !== "balanced" };
}

/**
 * Stock attendu d'un élément en fin de service (EF-CLO-03) :
 * stock du matin + réquisitions − ventes.
 */
export function computeExpectedStock(input: {
  morning: number;
  requisitioned: number;
  sold: number;
}): number {
  return input.morning + input.requisitioned - input.sold;
}
