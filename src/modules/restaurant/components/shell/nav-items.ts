import {
  ArrowRightLeft,
  Armchair,
  Bike,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  SquarePlus,
  Sunrise,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

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
};

export const DEFAULT_NAV_MODULE = "restaurant";

export const NAV_ITEMS: readonly NavItem[] = [
  { segment: "", label: "Tableau de bord", shortLabel: "Accueil", icon: LayoutDashboard },
  { segment: "commandes", label: "Commandes", shortLabel: "Commandes", icon: ClipboardList },
  {
    segment: "commandes/nouvelle",
    label: "Nouvelle commande",
    shortLabel: "Commander",
    icon: SquarePlus,
  },
  { segment: "menus", label: "Menus", shortLabel: "Menus", icon: UtensilsCrossed },
  { segment: "tables", label: "Tables", shortLabel: "Tables", icon: Armchair },
  {
    segment: "stock-du-matin",
    label: "Stock du matin",
    shortLabel: "Stock",
    icon: Sunrise,
  },
  {
    segment: "requisitions",
    label: "Réquisitions",
    shortLabel: "Réquisitions",
    icon: ArrowRightLeft,
    isUpcoming: true,
  },
  {
    segment: "clotures",
    label: "Clôtures",
    shortLabel: "Clôtures",
    icon: Calculator,
    isUpcoming: true,
  },
  {
    segment: "livraisons",
    label: "Livraisons",
    shortLabel: "Livraisons",
    icon: Bike,
    isUpcoming: true,
    module: "delivery",
  },
];

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
