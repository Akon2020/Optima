import { formatMoney, type Money } from "@/shared/lib/money";
import type { StatusTone } from "@/shared/ui/badge";

import { computeCashVariance } from "../../domain/closing";

/** Montant saisi à la française (« 22 000 », « 15,79 », « 0 ») ; `null` s'il est illisible. */
export function parseCountedAmount(text: string): number | null {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Libellé d'un écart de caisse : jamais porté par la seule couleur (§ 4.4). */
export function cashVarianceLabel(
  expected: Money,
  counted: Money,
): { label: string; tone: StatusTone } {
  const { kind, variance } = computeCashVariance(expected, counted);
  if (kind === "balanced") return { label: "Juste", tone: "success" };
  const amount = formatMoney({ ...variance, amountMinor: Math.abs(variance.amountMinor) });
  return kind === "shortage"
    ? { label: `Manque ${amount}`, tone: "danger" }
    : { label: `Excédent ${amount}`, tone: "warning" };
}

/** Libellé d'un écart de stock, en unités. */
export function stockVarianceLabel(variance: number | null): { label: string; tone: StatusTone } {
  if (variance === null) return { label: "Sans stock du matin", tone: "neutral" };
  if (variance === 0) return { label: "Juste", tone: "success" };
  return variance < 0
    ? { label: `Manque ${Math.abs(variance)}`, tone: "danger" }
    : { label: `Surplus ${variance}`, tone: "warning" };
}
