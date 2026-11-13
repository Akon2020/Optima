/**
 * Règles de cache du service worker (PWA hors connexion, EF-OFF-05, ENF-13).
 * Fonctions pures, partagées par le service worker et l'application.
 *
 * Principe : seules les pages du module Restaurant (qui lisent leurs données
 * dans IndexedDB, pas dans le HTML) et les fichiers statiques sont gardés en
 * cache. Tout le reste passe toujours par le réseau : espace propriétaire,
 * équipe, appareils, journal, connexion et API. Aucune réponse de
 * `/api/sync` n'est donc jamais écrite dans le cache du navigateur.
 */

export const OFFLINE_FALLBACK_URL = "/hors-ligne";
/** Adresse d'ouverture de l'application installée (manifeste). */
export const LAUNCH_URL = "/ouvrir";
export const PAGES_CACHE = "optima-restaurant-pages";
export const STATIC_CACHE = "optima-static";
/** Message envoyé par l'application pour préparer les pages d'un établissement. */
export const WARM_MESSAGE = "optima:warm-restaurant-pages";
/** Dernier établissement ouvert sur cet appareil (relu par la page d'ouverture). */
export const LAST_RESTAURANT_KEY = "optima:last-restaurant";

const SLUG = "[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?";
const RESTAURANT_PAGE = new RegExp(`^/e/${SLUG}/restaurant(?:/[a-z0-9-]+){0,3}/?$`);
const NEVER_CACHED = [
  /^\/api(?:\/|$)/,
  /^\/proprietaire(?:\/|$)/,
  /^\/connexion(?:\/|$)/,
  /^\/compte(?:\/|$)/,
  new RegExp(`^/e/${SLUG}/(?:equipe|appareils|journal)(?:/|$)`),
  /^\/sw\.js$/,
];

export function isSlug(value: string): boolean {
  return new RegExp(`^${SLUG}$`).test(value);
}

/** Page du module Restaurant, utilisable hors connexion une fois visitée. */
export function isRestaurantPage(pathname: string): boolean {
  return RESTAURANT_PAGE.test(pathname);
}

/** Fichiers versionnés ou statiques, sans donnée. */
export function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  );
}

/** Jamais en cache : données en ligne, comptes, administration, API. */
export function isNeverCached(pathname: string): boolean {
  return NEVER_CACHED.some((rule) => rule.test(pathname));
}

/**
 * Adresses à préparer pour un établissement : celles du menu de l'appareil.
 * Toute adresse refusée par `isRestaurantPage` est écartée.
 */
export function restaurantPagesToWarm(slug: string, segments: readonly string[]): string[] {
  if (!isSlug(slug)) return [];
  return [
    ...new Set(
      segments
        .map((segment) => `/e/${slug}/restaurant${segment ? `/${segment}` : ""}`)
        .filter(isRestaurantPage),
    ),
  ];
}

/**
 * Contrôle d'un message de préparation reçu par le service worker : seules
 * des adresses relatives de pages Restaurant sont acceptées (aucune adresse
 * externe, aucun autre chemin), au plus 30.
 */
export function sanitizeWarmUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value.startsWith("/") && !value.startsWith("//") && isRestaurantPage(value))
    .slice(0, 30);
}
