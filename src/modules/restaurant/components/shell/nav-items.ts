import {
  ArrowRightLeft,
  ChefHat,
  Armchair,
  Bike,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Printer,
  SquarePlus,
  Sunrise,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { hasPermission, type RestaurantPermission, type RestaurantRole } from "../../permissions";

export type NavItem = {
  /** Segment relatif à /e/[etablissement]/restaurant (URL en français). */
  segment: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Indique un écran encore en construction. */
  isUpcoming?: boolean;
  /**
   * Module qui porte l'écran (EF-MOD-02, `src/modules/registry.ts`) :
   * « restaurant » par défaut. L'écran disparaît si le module est désactivé.
   */
  module?: string;
  /**
   * Permission qui rend l'écran utile au rôle actif (matrice des droits) :
   * sans elle, l'élément n'apparaît pas dans le menu. L'action reste de
   * toute façon contrôlée par l'appareil et par le serveur.
   */
  permission?: RestaurantPermission;
  /** Rôles à qui l'écran ne sert pas, malgré la permission (ex. le livreur). */
  hiddenFor?: readonly RestaurantRole[];
};

export const DEFAULT_NAV_MODULE = "restaurant";

export const NAV_ITEMS: readonly NavItem[] = [
  {
    segment: "",
    label: "Tableau de bord",
    shortLabel: "Accueil",
    icon: LayoutDashboard,
    // Le tableau de bord montre des montants : ni le préparateur ni le livreur.
    permission: "restaurant.closing.read",
    hiddenFor: ["courier"],
  },
  {
    segment: "commandes",
    label: "Commandes",
    shortLabel: "Commandes",
    icon: ClipboardList,
    permission: "restaurant.order.create",
  },
  {
    segment: "commandes/nouvelle",
    label: "Nouvelle commande",
    shortLabel: "Commander",
    icon: SquarePlus,
    permission: "restaurant.order.create",
  },
  {
    segment: "menus",
    label: "Menus",
    shortLabel: "Menus",
    icon: UtensilsCrossed,
    permission: "restaurant.menu.read",
  },
  {
    segment: "tables",
    label: "Tables",
    shortLabel: "Tables",
    icon: Armchair,
    permission: "restaurant.table.release",
  },
  {
    segment: "caisse",
    label: "Caisse",
    shortLabel: "Caisse",
    icon: Wallet,
    permission: "restaurant.payment.collect",
  },
  {
    segment: "clients",
    label: "Clients",
    shortLabel: "Clients",
    icon: Users,
    permission: "restaurant.customer.create",
  },
  {
    segment: "stock-du-matin",
    label: "Stock du matin",
    shortLabel: "Stock",
    icon: Sunrise,
    permission: "restaurant.morning-stock.read",
  },
  {
    segment: "requisitions",
    label: "Réquisitions",
    shortLabel: "Réquisitions",
    icon: ArrowRightLeft,
    permission: "restaurant.requisition.create",
  },
  {
    segment: "preparation",
    label: "Préparation",
    shortLabel: "Préparation",
    icon: ChefHat,
    module: "preparation",
    permission: "restaurant.order.prep-status",
    hiddenFor: ["courier"],
  },
  {
    segment: "clotures",
    label: "Clôtures",
    shortLabel: "Clôtures",
    icon: Calculator,
    permission: "restaurant.closing.read",
  },
  {
    segment: "livraisons",
    label: "Livraisons",
    shortLabel: "Livraisons",
    icon: Bike,
    module: "delivery",
    permission: "delivery.read",
  },
  {
    segment: "imprimante",
    label: "Imprimante",
    shortLabel: "Imprimante",
    icon: Printer,
    // Ceux qui impriment des factures d'avance : serveur, poste, gérant (D-074).
    permission: "restaurant.order.prep-status",
  },
];

/**
 * Menu du rôle actif (D-073) : seuls les écrans utiles à ce rôle, par exemple
 * Menus, Caisse, Clôtures et Livraisons pour un livreur.
 */
export function navItemsForRole(items: readonly NavItem[], role: RestaurantRole): NavItem[] {
  return items.filter(
    (item) =>
      (item.permission === undefined || hasPermission(role, item.permission)) &&
      !(item.hiddenFor ?? []).includes(role),
  );
}

export function restaurantHref(slug: string, segment: string): string {
  return `/e/${slug}/restaurant${segment ? `/${segment}` : ""}`;
}

/** Élément actif : correspondance exacte, ou préfixe pour les sous-pages. */
export function isNavItemActive(pathname: string, slug: string, segment: string): boolean {
  const href = restaurantHref(slug, segment);
  if (segment === "") return pathname === href;
  if (segment === "commandes") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Module d'un élément de navigation. */
export function navItemModule(item: NavItem): string {
  return item.module ?? DEFAULT_NAV_MODULE;
}

/** EF-MOD-02 : éléments dont le module est actif. */
export function enabledNavItems(
  items: readonly NavItem[],
  isModuleEnabled: (module: string) => boolean,
): NavItem[] {
  return items.filter((item) => isModuleEnabled(navItemModule(item)));
}

/** Élément de navigation de la page courante (le plus précis), s'il y en a un. */
export function navItemForPath(
  pathname: string,
  slug: string,
  items: readonly NavItem[] = NAV_ITEMS,
): NavItem | null {
  return (
    [...items]
      .sort((a, b) => b.segment.length - a.segment.length)
      .find((item) => {
        const href = restaurantHref(slug, item.segment);
        return pathname === href || (item.segment !== "" && pathname.startsWith(`${href}/`));
      }) ?? null
  );
}
