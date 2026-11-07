import type { MenuItem, MenuKind, SaleUnit, ServicePoint } from "./types";

export const SALE_UNIT_LABELS: Record<SaleUnit, { one: string; many: string }> = {
  bottle: { one: "bouteille", many: "bouteilles" },
  dish: { one: "plat", many: "plats" },
  piece: { one: "morceau", many: "morceaux" },
};

export function formatQuantity(quantity: number, unit: SaleUnit): string {
  const labels = SALE_UNIT_LABELS[unit];
  return `${quantity} ${Math.abs(quantity) > 1 ? labels.many : labels.one}`;
}

export type Availability =
  | { status: "no-price" }
  | { status: "unknown-stock" }
  | { status: "available"; remaining: number }
  | { status: "low"; remaining: number }
  | { status: "sold-out"; remaining: number };

/**
 * Disponibilité d'un élément de menu pour la journée.
 *
 * - RG-PRX-01 : sans prix, il ne se vend pas.
 * - RG-REQ-03 : sans stock du matin saisi, la commande reste possible
 *   (stock inconnu).
 * - RG-RES-01 : stock du jour à zéro, il est épuisé.
 * - RG-STK-03 : le reste peut devenir négatif après synchronisation ; il est
 *   alors traité comme épuisé.
 */
export function computeAvailability(
  item: Pick<MenuItem, "price">,
  morningQuantity: number | null,
  soldQuantity: number,
  lowStockThreshold: number,
): Availability {
  if (item.price === null) return { status: "no-price" };
  if (morningQuantity === null) return { status: "unknown-stock" };
  const remaining = morningQuantity - soldQuantity;
  if (remaining <= 0) return { status: "sold-out", remaining };
  if (remaining <= lowStockThreshold) return { status: "low", remaining };
  return { status: "available", remaining };
}

export function isOrderable(availability: Availability): boolean {
  return availability.status !== "no-price" && availability.status !== "sold-out";
}

/** Quantité maximale commandable, ou `null` si le stock du jour est inconnu. */
export function maxOrderableQuantity(availability: Availability): number | null {
  if (availability.status === "available" || availability.status === "low") {
    return availability.remaining;
  }
  if (availability.status === "unknown-stock") return null;
  return 0;
}

/** Éléments d'un menu (boissons ou nourriture), non archivés (EF-RES-02). */
export function itemsForMenu(
  items: readonly MenuItem[],
  servicePoints: readonly ServicePoint[],
  menu: MenuKind,
): MenuItem[] {
  const pointIds = new Set(servicePoints.filter((p) => p.menu === menu).map((p) => p.id));
  return items.filter((item) => item.archivedAt === null && pointIds.has(item.servicePointId));
}

/**
 * Trie les éléments par popularité décroissante puis par nom (EF-CMD-01 :
 * les plus vendus apparaissent en premier).
 */
export function sortByPopularity<T extends Pick<MenuItem, "id" | "name">>(
  items: readonly T[],
  soldById: ReadonlyMap<string, number>,
): T[] {
  return [...items].sort((a, b) => {
    const diff = (soldById.get(b.id) ?? 0) - (soldById.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
  });
}

/** Recherche insensible aux accents et à la casse (EF-CAT-05). */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesSearch(text: string, query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  return normalizedQuery === "" || normalizeSearch(text).includes(normalizedQuery);
}
