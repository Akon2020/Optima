"use client";

import { useEffect } from "react";

import { LAST_RESTAURANT_KEY, WARM_MESSAGE, restaurantPagesToWarm } from "@/offline/cache-rules";

import { useRestaurant } from "../restaurant-provider";
import { NAV_ITEMS, enabledNavItems } from "./nav-items";

/**
 * Prépare l'appareil au travail hors connexion (EF-OFF-05) :
 * - mémorise l'établissement ouvert, repris par `/ouvrir` au lancement de
 *   l'application installée ;
 * - demande au service worker de garder les pages du menu (modules actifs),
 *   pour qu'elles s'ouvrent ensuite même sans réseau.
 */
export function useOfflinePreparation(): void {
  const { slug, isDemo, status, device, isModuleEnabled } = useRestaurant();
  const isReady = status === "ready" && (isDemo || device !== null);
  const segments = enabledNavItems(NAV_ITEMS, isModuleEnabled).map((item) => item.segment);
  const key = segments.join("|");

  useEffect(() => {
    if (!isReady) return;
    if (!isDemo) {
      try {
        window.localStorage.setItem(LAST_RESTAURANT_KEY, slug);
      } catch {
        // Stockage indisponible (navigation privée) : l'ouverture passera par la connexion.
      }
    }
    if (!("serviceWorker" in navigator) || !navigator.onLine) return;
    const urls = restaurantPagesToWarm(slug, key.split("|"));
    let isCancelled = false;
    void navigator.serviceWorker.ready.then((registration) => {
      if (!isCancelled) registration.active?.postMessage({ type: WARM_MESSAGE, urls });
    });
    return () => {
      isCancelled = true;
    };
  }, [isReady, isDemo, slug, key]);
}
