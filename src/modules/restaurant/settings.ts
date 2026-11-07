import type { Currency } from "@/shared/lib/money";

import { DEFAULT_BUSINESS_DAY_START_HOUR } from "./domain/business-day";

/**
 * Paramètres d'établissement du module Restaurant, avec leurs valeurs par
 * défaut (CLAUDE.md § 2.5). Ils seront lus depuis `establishment_settings`
 * quand le socle serveur existera.
 */
export type RestaurantSettings = {
  /** Devise de base, figée à la création de l'établissement (RG-ETB-01). */
  currency: Currency;
  timeZone: string;
  /** Seuil sous lequel un élément du menu est signalé « stock faible ». */
  lowStockThreshold: number;
  /** HYPOTHÈSE D-Q10 : heure de début de la journée d'exploitation. */
  businessDayStartHour: number;
};

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettings = {
  currency: "CDF",
  timeZone: "Africa/Lubumbashi",
  lowStockThreshold: 5,
  businessDayStartHour: DEFAULT_BUSINESS_DAY_START_HOUR,
};
