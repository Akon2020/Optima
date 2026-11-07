import type { MenuItem, MorningStockEntry } from "./types";

/**
 * Stock du matin (EF-REQ-03, EF-REQ-04, RG-REQ-02, RG-REQ-03).
 *
 * Proposition = stock restant de la veille + réquisition du jour, en unités
 * de vente (bouteilles, plats, morceaux).
 *
 * HYPOTHÈSE D-Q14 : tant que les clôtures (stock compté) et les réquisitions
 * n'existent pas, le « stock de clôture de la veille » est le stock théorique
 * (stock du matin de la veille moins les ventes de la veille), et la
 * réquisition du jour est inconnue. Les apports du jour apparaissent donc
 * comme des écarts, justifiés par le motif « Réquisition du jour ». Seule
 * cette fonction changera quand ces écrans existeront.
 */
export function proposeMorningQuantity(input: {
  previousMorning: number | null;
  previousSold: number;
  requisitioned: number | null;
}): number | null {
  const { previousMorning, previousSold, requisitioned } = input;
  if (previousMorning === null && requisitioned === null) return null;
  // Un reste négatif (RG-STK-03, ventes hors connexion) n'est pas un stock :
  // il est ramené à zéro et l'anomalie reste visible dans les ventes de la veille.
  const remaining = previousMorning === null ? 0 : Math.max(0, previousMorning - previousSold);
  return remaining + (requisitioned ?? 0);
}

/** Écart entre la saisie et la proposition, ou `null` sans proposition. */
export function morningVariance(proposed: number | null, quantity: number): number | null {
  return proposed === null ? null : quantity - proposed;
}

/**
 * RG-REQ-02 : un motif est exigé si la quantité saisie diffère de la
 * proposition, ou si elle corrige une saisie déjà validée.
 */
export function requiresReason(input: {
  proposed: number | null;
  quantity: number;
  previous: number | null;
}): boolean {
  const { proposed, quantity, previous } = input;
  if (previous !== null) return quantity !== previous;
  return proposed !== null && quantity !== proposed;
}

export type MorningLineInput = {
  menuItemId: string;
  name: string;
  quantity: number | null;
  proposed: number | null;
  previous: number | null;
  reason: string;
};

export type MorningLineIssue = {
  menuItemId: string;
  code: "QUANTITY_REQUIRED" | "INVALID_QUANTITY" | "REASON_REQUIRED";
  message: string;
};

export const MIN_REASON_LENGTH = 3;

/** Contrôle d'une saisie complète d'un point de service, avant validation. */
export function validateMorningLines(lines: readonly MorningLineInput[]): MorningLineIssue[] {
  const issues: MorningLineIssue[] = [];
  for (const line of lines) {
    if (line.quantity === null) {
      issues.push({
        menuItemId: line.menuItemId,
        code: "QUANTITY_REQUIRED",
        message: `Saisissez la quantité de « ${line.name} » (0 s'il n'y en a pas).`,
      });
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 0 || line.quantity > 100_000) {
      issues.push({
        menuItemId: line.menuItemId,
        code: "INVALID_QUANTITY",
        message: `La quantité de « ${line.name} » doit être un nombre entier positif ou nul.`,
      });
      continue;
    }
    if (
      requiresReason({
        proposed: line.proposed,
        quantity: line.quantity,
        previous: line.previous,
      }) &&
      line.reason.trim().length < MIN_REASON_LENGTH
    ) {
      issues.push({
        menuItemId: line.menuItemId,
        code: "REASON_REQUIRED",
        message: `Indiquez le motif de l'écart pour « ${line.name} ».`,
      });
    }
  }
  return issues;
}

/** Saisie en vigueur pour chaque élément : la plus récente (les corrections remplacent). */
export function currentEntries(
  entries: readonly MorningStockEntry[],
): Map<string, MorningStockEntry> {
  const current = new Map<string, MorningStockEntry>();
  for (const entry of entries) {
    const existing = current.get(entry.menuItemId);
    if (!existing || entry.enteredAt > existing.enteredAt) current.set(entry.menuItemId, entry);
  }
  return current;
}

/** Éléments dont le stock du matin est attendu : au menu et vendables (prix fixé). */
export function itemsRequiringMorningStock(
  items: readonly MenuItem[],
  servicePointId: string,
): MenuItem[] {
  return items.filter(
    (item) =>
      item.servicePointId === servicePointId && item.archivedAt === null && item.price !== null,
  );
}

/**
 * EF-TDB-04 et RG-REQ-03 : le stock du matin d'un point de service est
 * complet quand chaque élément vendable a une saisie pour la journée.
 */
export function isMorningStockComplete(
  items: readonly MenuItem[],
  servicePointId: string,
  current: ReadonlyMap<string, MorningStockEntry>,
): boolean {
  const required = itemsRequiringMorningStock(items, servicePointId);
  return required.length > 0 && required.every((item) => current.has(item.id));
}

/** Motifs proposés en un geste ; le texte reste libre (paramètre modifiable). */
export const DEFAULT_MORNING_REASONS = [
  "Réquisition du jour",
  "Casse",
  "Perte",
  "Erreur de comptage",
  "Consommation du personnel",
] as const;
