import type { MorningStockEntry, Requisition, RequisitionKind } from "./types";

/**
 * Réquisitions du magasin vers les points de service (EF-REQ-01, EF-REQ-02,
 * EF-REQ-04, RG-REQ-01), D-Q14 tranchée le 17/11/2026 (D-069) :
 * - le magasin est tenu par le gérant, qui établit et valide la réquisition
 *   d'un même geste ;
 * - les boissons passent aussi par une réquisition vers le comptoir ;
 * - les quantités sont en unités de vente (bouteilles, plats, morceaux) ;
 * - une réquisition principale le matin, des compléments pendant le service.
 *
 * Le stock du magasin lui-même (réceptions, solde) viendra avec le module
 * Achats (EF-ACH) : HYPOTHÈSE D-069, la sortie du magasin est enregistrée,
 * son solde n'est pas encore tenu.
 */

export const REQUISITION_KIND_LABELS: Record<RequisitionKind, string> = {
  main: "Réquisition du matin",
  complement: "Complément",
  return: "Retour au magasin",
};

export const MAX_REQUISITION_QUANTITY = 100_000;
export const MIN_RETURN_REASON_LENGTH = 3;

/**
 * Heure de la première saisie du stock du matin d'un point de service pour
 * une journée, ou `null` s'il n'est pas encore saisi.
 */
export function firstMorningEntryAt(
  entries: readonly Pick<MorningStockEntry, "day" | "servicePointId" | "enteredAt">[],
  servicePointId: string,
  day: string,
): string | null {
  let first: string | null = null;
  for (const entry of entries) {
    if (entry.day !== day || entry.servicePointId !== servicePointId) continue;
    if (first === null || entry.enteredAt < first) first = entry.enteredAt;
  }
  return first;
}

/**
 * Genre d'une réquisition (D-069) : principale si le stock du matin du point
 * n'était pas encore saisi au moment où elle est faite, complément sinon. Un
 * retour au magasin reste un retour. Le serveur refait ce calcul avec toutes
 * les saisies connues : un appareil hors connexion peut ignorer qu'un autre a
 * déjà saisi le stock du matin.
 */
export function requisitionKind(input: {
  isReturn: boolean;
  createdAt: string;
  morningEnteredAt: string | null;
}): RequisitionKind {
  if (input.isReturn) return "return";
  return input.morningEnteredAt === null || input.createdAt < input.morningEnteredAt
    ? "main"
    : "complement";
}

function addLines(
  totals: Map<string, number>,
  requisition: Pick<Requisition, "lines">,
  sign: 1 | -1,
) {
  for (const line of requisition.lines) {
    totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + sign * line.quantity);
  }
}

/**
 * Quantités des réquisitions principales d'une journée, par élément : elles
 * entrent dans la proposition du stock du matin (EF-REQ-04).
 */
export function morningRequisitioned(
  requisitions: readonly Pick<Requisition, "day" | "kind" | "lines">[],
  day: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const requisition of requisitions) {
    if (requisition.day === day && requisition.kind === "main") addLines(totals, requisition, 1);
  }
  return totals;
}

/**
 * Compléments moins retours d'une journée, par élément : ils s'ajoutent au
 * stock attendu à la clôture (EF-CLO-03), le stock du matin comprenant déjà
 * les réquisitions principales.
 */
export function laterRequisitioned(
  requisitions: readonly Pick<Requisition, "day" | "kind" | "lines">[],
  day: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const requisition of requisitions) {
    if (requisition.day !== day) continue;
    if (requisition.kind === "complement") addLines(totals, requisition, 1);
    else if (requisition.kind === "return") addLines(totals, requisition, -1);
  }
  return totals;
}

/**
 * Stock entré dans la journée pour un élément : le stock du matin plus les
 * compléments, moins les retours (D-069). `null` tant que le stock du matin
 * n'est pas saisi : la disponibilité reste « inconnue » (RG-REQ-03).
 */
export function stockInOfDay(morning: number | null, later: number): number | null {
  return morning === null ? null : morning + later;
}

export type RequisitionIssue = { code: string; message: string; menuItemId?: string };

/**
 * Contrôle d'une réquisition avant enregistrement (appareil et serveur) :
 * au moins une ligne, des quantités entières positives, des éléments suivis
 * en stock par ce point de service, et un motif pour un retour.
 */
export function validateRequisition(input: {
  isReturn: boolean;
  lines: readonly { menuItemId: string; quantity: number }[];
  comment: string | null;
  /** Éléments suivis en stock par le point de service, par identifiant. */
  allowedItems: ReadonlyMap<string, { name: string }>;
}): RequisitionIssue[] {
  const issues: RequisitionIssue[] = [];
  if (input.lines.length === 0) {
    issues.push({
      code: "EMPTY_REQUISITION",
      message: "Indiquez au moins une quantité à faire sortir du magasin.",
    });
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    const item = input.allowedItems.get(line.menuItemId);
    if (!item) {
      issues.push({
        code: "ITEM_NOT_FOUND",
        menuItemId: line.menuItemId,
        message: "Un élément ne fait pas partie du stock de ce point de service.",
      });
      continue;
    }
    if (seen.has(line.menuItemId)) {
      issues.push({
        code: "DUPLICATE_ITEM",
        menuItemId: line.menuItemId,
        message: `« ${item.name} » figure deux fois : regroupez les quantités.`,
      });
    }
    seen.add(line.menuItemId);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_REQUISITION_QUANTITY
    ) {
      issues.push({
        code: "INVALID_QUANTITY",
        menuItemId: line.menuItemId,
        message: `La quantité de « ${item.name} » doit être un nombre entier positif.`,
      });
    }
  }
  if (input.isReturn && (input.comment ?? "").trim().length < MIN_RETURN_REASON_LENGTH) {
    issues.push({
      code: "REASON_REQUIRED",
      message: "Un retour au magasin demande un motif (erreur de réquisition, surplus...).",
    });
  }
  return issues;
}
