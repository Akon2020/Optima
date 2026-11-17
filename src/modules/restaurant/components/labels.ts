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
import type {
  MobileMoneyProvider,
  OrderLine,
  OrderMode,
  PaymentMethod,
  PaymentStatus,
  PrepStatus,
  ServicePointKind,
} from "../domain/types";

export const PREP_STATUS: Record<PrepStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "En préparation", tone: "warning" },
  ready: { label: "Prête", tone: "accent" },
  served: { label: "Servie", tone: "success" },
};

/** Statut de paiement (EF-ENC-02) : jamais porté par la seule couleur (§ 4.4). */
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: StatusTone }> = {
  unpaid: { label: "À encaisser", tone: "warning" },
  partial: { label: "Payée en partie", tone: "accent" },
  paid: { label: "Payée", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  "mobile-money": "Mobile Money",
};

export const PROVIDER_LABELS: Record<MobileMoneyProvider, string> = {
  mpesa: "M-Pesa",
  "orange-money": "Orange Money",
  "airtel-money": "Airtel Money",
};

/** Libellé d'un mode de paiement détenu : « Espèces en dollars », « M-Pesa ». */
export function holdingLabel(
  method: PaymentMethod,
  provider: MobileMoneyProvider | null,
  currency: string,
  base: string,
): string {
  const name = method === "cash" ? "Espèces" : PROVIDER_LABELS[provider ?? "mpesa"];
  if (currency === base) return method === "cash" ? "Espèces en francs" : name;
  return `${name} en ${currency === "USD" ? "dollars" : "francs"}`;
}

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

/**
 * Précisions d'une ligne de facture (D-060) : options choisies, et formule
 * dont la ligne fait partie (« Formule porc »), pour le poste qui la prépare.
 */
export function orderLineDetail(line: OrderLine): string {
  const parts = (line.options ?? []).map((option) => option.name);
  if (line.formula) parts.push(line.formula.name);
  return parts.join(" · ");
}
