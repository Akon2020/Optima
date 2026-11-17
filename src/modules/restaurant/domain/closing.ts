import { addMoney, subtractMoney, zero, type Currency, type Money } from "@/shared/lib/money";

import { holdingsByMode, type InvoiceBalance } from "./payment";
import type {
  AdvanceInvoice,
  CashClosing,
  CashClosingLine,
  Payment,
  StockCount,
  StockCountLine,
} from "./types";

/**
 * Clôture de service (EF-CLO-01 à 04, RG-CLO-01 à 03, RG-ENC-02, D-039,
 * D-056).
 *
 * 1. Chaque personne qui a encaissé déclare ce qu'elle a compté, par mode de
 *    paiement : l'attendu vient de ses paiements pas encore clôturés.
 * 2. Le gérant compte le stock de chaque point de service.
 * 3. Le gérant valide la journée quand tout est déclaré, compté et envoyé.
 */

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

export const MIN_COMMENT_LENGTH = 3;

// ─── Clôture de caisse d'une personne ───────────────────────────────────────

/** Paiements encaissés par `userId` qui ne figurent dans aucune de ses clôtures. */
export function unclosedPayments(
  payments: readonly Payment[],
  closings: readonly Pick<CashClosing, "paymentIds">[],
  userId: string,
): Payment[] {
  const closed = new Set(closings.flatMap((closing) => closing.paymentIds));
  return payments.filter((payment) => payment.collectedBy === userId && !closed.has(payment.id));
}

/** Personnes qui détiennent encore de l'argent non clôturé (RG-CLO-01 : nommées). */
export function collectorsWithUnclosedPayments(
  payments: readonly Payment[],
  closings: readonly Pick<CashClosing, "paymentIds">[],
): { userId: string; name: string; payments: number }[] {
  const closed = new Set(closings.flatMap((closing) => closing.paymentIds));
  const byUser = new Map<string, { userId: string; name: string; payments: number }>();
  for (const payment of payments) {
    if (closed.has(payment.id)) continue;
    const entry = byUser.get(payment.collectedBy) ?? {
      userId: payment.collectedBy,
      name: payment.collectedByName,
      payments: 0,
    };
    entry.payments += 1;
    byUser.set(payment.collectedBy, entry);
  }
  return [...byUser.values()];
}

/** Lignes attendues d'une clôture de caisse, un mode de paiement par ligne (EF-CLO-01). */
export function expectedCashLines(
  payments: readonly Payment[],
  base: Currency,
): Omit<CashClosingLine, "counted">[] {
  return holdingsByMode(payments, base).map((bucket) => ({
    key: bucket.key,
    method: bucket.method,
    provider: bucket.provider,
    expected: bucket.amount,
  }));
}

/**
 * EF-CLO-01 : part de l'argent encaissé qui revient à chaque point de service
 * (comptoir, cuisine, grillade), d'après les factures réglées. Le serveur la
 * reverse à la caisse de chaque point (D-032).
 */
export function collectedByServicePoint(
  payments: readonly Pick<Payment, "allocations">[],
  invoices: readonly Pick<AdvanceInvoice, "id" | "servicePointId">[],
  base: Currency,
): { servicePointId: string; amount: Money }[] {
  const pointOf = new Map(invoices.map((invoice) => [invoice.id, invoice.servicePointId]));
  const amounts = new Map<string, Money>();
  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      const point = pointOf.get(allocation.invoiceId);
      if (!point) continue;
      amounts.set(point, addMoney(amounts.get(point) ?? zero(base), allocation.amount));
    }
  }
  return [...amounts.entries()].map(([servicePointId, amount]) => ({ servicePointId, amount }));
}

/**
 * RG-ENC-02 : factures d'un serveur encore impayées (en tout ou en partie),
 * sauf celles converties en dette client par le gérant (D-059).
 */
export function unpaidInvoiceIds(
  invoices: readonly Pick<AdvanceInvoice, "id" | "waiterId" | "creditRequestId">[],
  balances: ReadonlyMap<string, Pick<InvoiceBalance, "remaining" | "status">>,
  waiterId: string,
): string[] {
  return invoices
    .filter((invoice) => {
      const balance = balances.get(invoice.id);
      return (
        invoice.waiterId === waiterId &&
        !invoice.creditRequestId &&
        balance !== undefined &&
        balance.status !== "cancelled" &&
        balance.remaining.amountMinor > 0
      );
    })
    .map((invoice) => invoice.id);
}

export type CashLineVariance = CashVariance & { key: string };

/** Écart de chaque mode de paiement, dans sa devise (on n'additionne pas francs et dollars). */
export function cashClosingVariances(
  lines: readonly Pick<CashClosingLine, "key" | "expected" | "counted">[],
): CashLineVariance[] {
  return lines.map((line) => ({
    key: line.key,
    ...computeCashVariance(line.expected, line.counted),
  }));
}

export type ClosingIssue = { code: string; message: string };

/** Contrôle d'une déclaration de caisse avant de la figer (EF-CLO-02). */
export function validateCashClosing(input: {
  lines: readonly Pick<CashClosingLine, "key" | "expected" | "counted">[];
  unpaidInvoiceIds: readonly string[];
  comment: string;
}): ClosingIssue | null {
  if (input.lines.length === 0 && input.unpaidInvoiceIds.length === 0) {
    return {
      code: "NOTHING_TO_CLOSE",
      message: "Vous n'avez aucun encaissement ni aucune facture impayée à clôturer.",
    };
  }
  if (input.lines.some((line) => line.counted.amountMinor < 0)) {
    return { code: "INVALID_AMOUNT", message: "Un montant compté ne peut pas être négatif." };
  }
  const hasVariance = cashClosingVariances(input.lines).some((line) => line.requiresComment);
  if (hasVariance && input.comment.trim().length < MIN_COMMENT_LENGTH) {
    return {
      code: "COMMENT_REQUIRED",
      message: "Expliquez l'écart (manquant ou excédent) avant de déclarer votre caisse.",
    };
  }
  return null;
}

/** Totaux par devise de lignes de caisse (rapport de la journée). */
export function totalsByCurrency(
  lines: readonly Pick<CashClosingLine, "expected" | "counted">[],
): { currency: Currency; expected: Money; counted: Money }[] {
  const totals = new Map<Currency, { currency: Currency; expected: Money; counted: Money }>();
  for (const line of lines) {
    const currency = line.expected.currency;
    const entry = totals.get(currency) ?? {
      currency,
      expected: zero(currency),
      counted: zero(currency),
    };
    entry.expected = addMoney(entry.expected, line.expected);
    entry.counted = addMoney(entry.counted, line.counted);
    totals.set(currency, entry);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// ─── Comptage du stock d'un point de service ────────────────────────────────

/**
 * Stock attendu d'une ligne de comptage, `null` sans stock du matin. Les
 * réquisitions principales sont déjà dans le stock du matin ; seuls les
 * compléments et les retours (D-069) s'y ajoutent ici.
 */
export function expectedStockOf(
  line: Pick<StockCountLine, "morning" | "sold" | "requisitioned">,
): number | null {
  return line.morning === null
    ? null
    : computeExpectedStock({
        morning: line.morning,
        requisitioned: line.requisitioned ?? 0,
        sold: line.sold,
      });
}

/**
 * Écart de stock (EF-CLO-03) : compté moins attendu, une fois retirées les
 * sorties déclarées (pertes, casse, repas du personnel, D-044). Négatif : il
 * manque des unités que rien n'explique.
 */
export function stockLineVariance(
  line: Pick<StockCountLine, "morning" | "requisitioned" | "sold" | "declaredOut" | "counted">,
): number | null {
  const expected = expectedStockOf(line);
  return expected === null ? null : line.counted - (expected - line.declaredOut);
}

export type StockCountIssue = ClosingIssue & { menuItemId?: string };

/** Contrôle d'un comptage avant enregistrement. */
export function validateStockCount(input: {
  lines: readonly StockCountLine[];
  comment: string;
}): StockCountIssue[] {
  const issues: StockCountIssue[] = [];
  for (const line of input.lines) {
    if (!Number.isInteger(line.counted) || line.counted < 0 || line.counted > 100_000) {
      issues.push({
        code: "INVALID_QUANTITY",
        menuItemId: line.menuItemId,
        message: `Le stock compté de « ${line.name} » doit être un nombre entier positif ou nul.`,
      });
      continue;
    }
    if (!Number.isInteger(line.declaredOut) || line.declaredOut < 0 || line.declaredOut > 100_000) {
      issues.push({
        code: "INVALID_QUANTITY",
        menuItemId: line.menuItemId,
        message: `Les sorties déclarées de « ${line.name} » doivent être un nombre entier positif ou nul.`,
      });
      continue;
    }
    if (line.declaredOut > 0 && (line.outReason ?? "").trim().length < MIN_COMMENT_LENGTH) {
      issues.push({
        code: "OUT_REASON_REQUIRED",
        menuItemId: line.menuItemId,
        message: `Indiquez le motif des sorties de « ${line.name} » (casse, perte, repas du personnel…).`,
      });
    }
  }
  const hasVariance = input.lines.some((line) => (stockLineVariance(line) ?? 0) !== 0);
  if (issues.length === 0 && hasVariance && input.comment.trim().length < MIN_COMMENT_LENGTH) {
    issues.push({
      code: "COMMENT_REQUIRED",
      message: "Expliquez les écarts de stock avant d'enregistrer le comptage.",
    });
  }
  return issues;
}

/** Comptage en vigueur de chaque point de service pour une journée : le plus récent. */
export function latestStockCounts(
  counts: readonly StockCount[],
  day: string,
): Map<string, StockCount> {
  const latest = new Map<string, StockCount>();
  for (const count of counts) {
    if (count.day !== day) continue;
    const current = latest.get(count.servicePointId);
    if (!current || count.countedAt > current.countedAt) latest.set(count.servicePointId, count);
  }
  return latest;
}

/** Sorties de motifs proposés en un geste (D-044) ; le texte reste libre. */
export const DEFAULT_OUT_REASONS = ["Casse", "Perte", "Repas du personnel", "Offert"] as const;

// ─── Validation de la journée ───────────────────────────────────────────────

/**
 * Ce qui empêche le gérant de valider la journée (EF-CLO-04) : stock du
 * matin manquant (RG-REQ-03), point de service non compté (EF-CLO-03),
 * argent non déclaré (RG-CLO-01), opérations en attente (RG-CLO-03).
 */
export function dayClosingIssues(input: {
  isAlreadyValidated: boolean;
  pointsMissingMorningStock: readonly string[];
  pointsNotCounted: readonly string[];
  undeclaredCollectors: readonly string[];
  pendingOperations: number;
  isOnline: boolean;
}): ClosingIssue[] {
  const issues: ClosingIssue[] = [];
  if (input.isAlreadyValidated) {
    issues.push({ code: "ALREADY_VALIDATED", message: "Cette journée est déjà validée." });
    return issues;
  }
  for (const point of input.pointsMissingMorningStock) {
    issues.push({
      code: "MORNING_STOCK_MISSING",
      message: `${point} : le stock du matin n'a pas été saisi (RG-REQ-03).`,
    });
  }
  for (const point of input.pointsNotCounted) {
    issues.push({ code: "STOCK_NOT_COUNTED", message: `${point} : le stock n'a pas été compté.` });
  }
  for (const name of input.undeclaredCollectors) {
    issues.push({
      code: "CASH_NOT_DECLARED",
      message: `${name} n'a pas encore déclaré sa caisse.`,
    });
  }
  if (input.pendingOperations > 0) {
    issues.push({
      code: "PENDING_OPERATIONS",
      message: `${input.pendingOperations} opération(s) de cet appareil attendent l'envoi au serveur.`,
    });
  }
  if (!input.isOnline) {
    issues.push({
      code: "OFFLINE",
      message: "Connectez l'appareil : la validation se fait avec le serveur.",
    });
  }
  return issues;
}
