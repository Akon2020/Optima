import { Building2, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/shared/ui/badge";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { MODULES } from "@/modules/registry";
import { getCurrentSession } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";

import { LogoutButton } from "../_components/logout-button";

export const metadata: Metadata = { title: "Espace propriétaire" };

/**
 * Espace propriétaire (P6). Première version : contrôle d'accès et liste des
 * établissements. Le tableau de bord consolidé (EF-PRO-01 à 06) vient ensuite.
 */
export default function OwnerPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="text-lg font-bold tracking-[0.2em] text-primary">OPTIMA</span>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold">Espace propriétaire</h1>
        <p className="mt-1 text-sm text-text-muted">
          Le tableau de bord consolidé est en cours de réalisation.
        </p>
        <Suspense fallback={<Skeleton className="mt-6 h-40" />}>
          <Establishments />
        </Suspense>
      </main>
    </div>
  );
}

async function Establishments() {
  const session = await getCurrentSession();
  // Contrôle côté serveur (CLAUDE.md § 3.3) : masquer un lien ne protège rien.
  if (!session) redirect("/connexion");
  if (!session.user.isOwner) redirect("/compte");
  if (!session.user.totpEnabledAt) redirect("/connexion/activer-2fa");
  if (!session.isElevated) redirect("/connexion/double-authentification");

  const establishments = await getPrisma().establishment.findMany({
    orderBy: { createdAt: "asc" },
    include: { modules: { where: { enabled: true } } },
  });

  if (establishments.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Aucun établissement"
        description="Créez le premier établissement avec « pnpm db:seed » en local, puis depuis cet espace."
      />
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {establishments.map((establishment) => (
        <li
          key={establishment.id}
          className="rounded-lg border border-border bg-surface p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold">{establishment.name}</h2>
            <Badge tone={establishment.status === "active" ? "success" : "warning"}>
              {establishment.status === "active" ? "Actif" : "Suspendu"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {establishment.type} · devise {establishment.baseCurrency}
          </p>
          <p className="mt-3 text-xs text-text-muted">
            Modules :{" "}
            {establishment.modules
              .map(
                (entry) =>
                  MODULES.find((module) => module.id === entry.module)?.name ?? entry.module,
              )
              .join(", ") || "aucun"}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4">
            <Link
              href={`/e/${establishment.slug}/equipe`}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-link hover:underline"
            >
              <Users aria-hidden className="size-4" />
              Équipe
            </Link>
            <Link
              href={`/e/${establishment.slug}/appareils`}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-link hover:underline"
            >
              <Smartphone aria-hidden className="size-4" />
              Appareils
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
