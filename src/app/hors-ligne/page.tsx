import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/shared/ui/button";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { LAUNCH_URL } from "@/offline/cache-rules";

import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Hors ligne" };

/**
 * Page de secours du service worker (EF-OFF-05) : servie hors connexion à la
 * place d'une page qui exige le réseau (espace propriétaire, équipe, journal,
 * connexion) ou d'une page Restaurant jamais ouverte sur cet appareil.
 * Statique et précachée : elle ne contient aucune donnée.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-full bg-warning-subtle text-text"
        >
          <WifiOff className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Pas de connexion</h1>
        <p className="mt-2 text-sm text-text-muted">
          Cette page a besoin d&apos;Internet. Le restaurant, lui, continue de fonctionner sur cet
          appareil : les commandes et le stock du matin sont enregistrés et partiront au retour du
          réseau.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={LAUNCH_URL} className={buttonClasses("primary")}>
            Ouvrir le restaurant
          </Link>
          <RetryButton />
        </div>
      </div>
      <div className="self-center">
        <ThemeSwitcher showLabels />
      </div>
    </main>
  );
}
