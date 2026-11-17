import type { AdvanceInvoice, MenuItem, ServicePoint, ServicePointKind } from "./types";

/**
 * Postes de préparation (EF-PRE-01 à 03, RG-PRE-01, RG-PRE-02, D-066) :
 * l'écran d'un poste reçoit les factures d'avance de son point de service,
 * les marque prêtes et déclare un élément épuisé pour la journée. Aucun
 * montant n'y figure (RG-PRE-01).
 */

/** Segment d'URL de chaque poste (URL en français, CLAUDE.md § 3.3). */
export const STATION_SLUGS: Record<ServicePointKind, string> = {
  counter: "comptoir",
  kitchen: "cuisine",
  grill: "grillade",
};

/** Commandes prêtes gardées en vue, pour qu'un préparateur corrige une erreur. */
export const READY_KEPT = 8;

export function stationSlug(point: Pick<ServicePoint, "kind">): string {
  return STATION_SLUGS[point.kind];
}

/** Point de service d'un poste, d'après le segment d'URL. */
export function pointForStation(
  slug: string,
  points: readonly ServicePoint[],
): ServicePoint | undefined {
  const kind = (Object.keys(STATION_SLUGS) as ServicePointKind[]).find(
    (key) => STATION_SLUGS[key] === slug,
  );
  return kind
    ? [...points].sort((a, b) => a.sortOrder - b.sortOrder).find((p) => p.kind === kind)
    : undefined;
}

/**
 * Matrice des droits, « Postes de préparation » : un préparateur ne travaille
 * que pour son poste ; le gérant et le propriétaire pour tous.
 */
export function canWorkStation(
  role: string,
  ownServicePointId: string | null | undefined,
  servicePointId: string,
): boolean {
  if (role === "owner" || role === "manager") return true;
  if (role === "prep") return ownServicePointId === servicePointId;
  return false;
}

type QueueInvoice = Pick<
  AdvanceInvoice,
  "id" | "servicePointId" | "createdAt" | "prepStatus" | "paymentStatus"
>;

/** File d'un poste : à préparer (la plus ancienne d'abord), puis prêtes (la plus récente d'abord). */
export function stationQueue<T extends QueueInvoice>(
  invoices: readonly T[],
  servicePointId: string,
): { pending: T[]; ready: T[] } {
  const own = invoices.filter(
    (invoice) => invoice.servicePointId === servicePointId && invoice.paymentStatus !== "cancelled",
  );
  return {
    pending: own
      .filter((invoice) => invoice.prepStatus === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ready: own
      .filter((invoice) => invoice.prepStatus === "ready")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, READY_KEPT),
  };
}

/** EF-PRE-02 : factures prêtes d'un serveur, pas encore servies. */
export function readyForWaiter<T extends QueueInvoice & Pick<AdvanceInvoice, "waiterId">>(
  invoices: readonly T[],
  waiterId: string,
): T[] {
  return invoices
    .filter(
      (invoice) =>
        invoice.waiterId === waiterId &&
        invoice.prepStatus === "ready" &&
        invoice.paymentStatus !== "cancelled",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** EF-PRE-03 : un élément déclaré épuisé l'est pour la journée d'exploitation en cours. */
export function isDeclaredSoldOut(item: Pick<MenuItem, "soldOutDay">, day: string): boolean {
  return item.soldOutDay === day;
}
