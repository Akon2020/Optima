"use client";

import { useEffect } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { LAST_RESTAURANT_KEY, isSlug } from "@/offline/cache-rules";

export function LaunchRedirect() {
  useEffect(() => {
    let slug: string | null = null;
    try {
      slug = window.localStorage.getItem(LAST_RESTAURANT_KEY);
    } catch {
      slug = null;
    }
    // Rechargement complet : la page Restaurant est servie par le service worker hors connexion.
    window.location.replace(slug && isSlug(slug) ? `/e/${slug}/restaurant` : "/connexion");
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-4">
      <p className="text-sm text-text-muted" role="status">
        Ouverture d&apos;OPTIMA…
      </p>
      <Skeleton className="h-32" />
    </main>
  );
}
