"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (EF-OFF-05). En production seulement : en
 * développement, un cache de pages masquerait les modifications du code.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      console.warn("Service worker non enregistré", error);
    });
  }, []);
  return null;
}
