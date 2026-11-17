/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

import {
  OFFLINE_FALLBACK_URL,
  PAGES_CACHE,
  STATIC_CACHE,
  WARM_MESSAGE,
  isNeverCached,
  isRestaurantPage,
  isStaticAsset,
  sanitizeWarmUrls,
} from "../cache-rules";

/**
 * Service worker d'OPTIMA (Serwist, pile D-014 ; construit par
 * `scripts/build-sw.mts`, D-028). Il rend le module Restaurant utilisable
 * sans réseau, y compris après un rechargement (EF-OFF-05, ENF-13) :
 * - fichiers statiques précachés au déploiement ;
 * - pages Restaurant : réseau d'abord, copie locale si le réseau manque ;
 * - tout le reste (API, comptes, administration) : réseau seulement, jamais
 *   en cache ; hors connexion, une page « Hors ligne » répond à la place.
 * Les données métier restent dans IndexedDB, pas dans ce cache.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Jamais en cache : API (dont la synchronisation), comptes, administration.
      matcher: ({ url, sameOrigin }) => sameOrigin && isNeverCached(url.pathname),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && isStaticAsset(url.pathname),
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * DAY })],
      }),
    },
    {
      // Documents des pages Restaurant seulement : les requêtes de navigation
      // interne (RSC) restent sur le réseau ; hors ligne, Next.js recharge la
      // page entière, servie depuis ce cache.
      matcher: ({ url, sameOrigin, request }) =>
        sameOrigin && request.mode === "navigate" && isRestaurantPage(url.pathname),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 14 * DAY })],
      }),
    },
    {
      // Autres pages : réseau seulement, avec la page « Hors ligne » en secours.
      matcher: ({ sameOrigin, request }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

/**
 * Préparation des pages d'un établissement (envoyée par l'application à
 * l'ouverture du Restaurant) : chaque page du menu est mise en cache tant
 * que le réseau est là, pour être disponible ensuite hors connexion.
 */
self.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown; urls?: unknown } | null;
  if (!data || data.type !== WARM_MESSAGE) return;
  const urls = sanitizeWarmUrls(data.urls);
  if (urls.length === 0) return;
  event.waitUntil(
    caches.open(PAGES_CACHE).then(async (cache) => {
      for (const url of urls) {
        try {
          const response = await fetch(url, { credentials: "same-origin", redirect: "error" });
          if (response.ok && response.type === "basic") await cache.put(url, response);
        } catch {
          // Hors ligne ou page indisponible : la copie existante est gardée.
        }
      }
    }),
  );
});

serwist.addEventListeners();
