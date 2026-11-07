import {
  Beef,
  Beer,
  CookingPot,
  CupSoda,
  Fish,
  Flame,
  GlassWater,
  Soup,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";

import type { StatusTone } from "@/shared/ui/badge";
import type { KpiTone } from "@/shared/ui/kpi";

import type { Availability } from "../domain/menu";
import type { OrderMode, PrepStatus, ServicePointKind } from "../domain/types";

export const PREP_STATUS: Record<PrepStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "En préparation", tone: "warning" },
  ready: { label: "Prête", tone: "accent" },
  served: { label: "Servie", tone: "success" },
};

export const ORDER_MODE_LABELS: Record<OrderMode, string> = {
  "dine-in": "Sur place",
  takeaway: "À emporter",
  delivery: "Livraison",
};

export function orderPlaceLabel(mode: OrderMode, tableLabel: string | null): string {
  return mode === "dine-in" && tableLabel ? tableLabel : ORDER_MODE_LABELS[mode];
}

export const SERVICE_POINT_ICONS: Record<ServicePointKind, LucideIcon> = {
  counter: Beer,
  kitchen: CookingPot,
  grill: Flame,
};

export const SERVICE_POINT_TONES: Record<ServicePointKind, KpiTone> = {
  counter: "yellow",
  kitchen: "green",
  grill: "peach",
};

/** Illustration d'un élément de menu selon sa catégorie (pas de photo en phase 1). */
export function categoryVisual(category: string): { icon: LucideIcon; tone: KpiTone } {
  const key = category.toLowerCase();
  if (key.includes("bière")) return { icon: Beer, tone: "yellow" };
  if (key.includes("sucré")) return { icon: CupSoda, tone: "rose" };
  if (key.includes("eau")) return { icon: GlassWater, tone: "grey" };
  if (key.includes("vin")) return { icon: Wine, tone: "rose" };
  if (key.includes("viande")) return { icon: Beef, tone: "peach" };
  if (key.includes("poisson")) return { icon: Fish, tone: "green" };
  if (key.includes("accompagnement")) return { icon: Soup, tone: "yellow" };
  if (key.includes("grillade")) return { icon: Flame, tone: "peach" };
  return { icon: UtensilsCrossed, tone: "grey" };
}

export function availabilityBadge(
  availability: Availability | undefined,
): { label: string; tone: StatusTone } | null {
  if (!availability) return null;
  switch (availability.status) {
    case "no-price":
      return { label: "Prix à fixer", tone: "danger" };
    case "sold-out":
      return { label: "Épuisé", tone: "danger" };
    case "low":
      return { label: `Plus que ${availability.remaining}`, tone: "warning" };
    case "available":
      return { label: `${availability.remaining} en stock`, tone: "success" };
    case "unknown-stock":
      return { label: "Stock non saisi", tone: "neutral" };
  }
}
