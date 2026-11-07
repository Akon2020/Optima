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
};

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
  { segment: "tables", label: "Tables", shortLabel: "Tables", icon: Armchair, isUpcoming: true },
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
