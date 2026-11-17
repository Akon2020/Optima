import { ArrowRight, Building2, Plus, Smartphone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/shared/ui/badge";
import { buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";

import { ESTABLISHMENT_TYPES, MODULES } from "@/modules/registry";
import { listEstablishments } from "@/server/owner/establishments";

import { OwnerFrame } from "../_components/owner-frame";
import { ownerPageContext } from "../_lib/owner";

export const metadata: Metadata = { title: "Établissements" };

/** Liste des établissements du propriétaire (EF-ETB, EF-MOD-01). */
export default function EstablishmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Establishments />
    </Suspense>
  );
}

async function Establishments() {
  const { db, actor } = await ownerPageContext();
  const establishments = await listEstablishments(db, actor);
  const typeName = (id: string) => ESTABLISHMENT_TYPES.find((type) => type.id === id)?.name ?? id;
  const moduleName = (id: string) => MODULES.find((entry) => entry.id === id)?.name ?? id;

  return (
    <OwnerFrame
      section="establishments"
      title="Établissements"
      description="Identité, modules, accès et suspension de chaque établissement."
      action={
        <Link href="/proprietaire/etablissements/nouveau" className={buttonClasses("primary")}>
          <Plus aria-hidden />
          Créer un établissement
        </Link>
      }
    >
      {establishments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Aucun établissement"
            description="Créez le premier : son gérant et ses appareils viendront ensuite."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {establishments.map((establishment) => (
            <li key={establishment.id}>
              <Card as="article" className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-medium">{establishment.name}</h2>
                    <p className="text-xs text-text-muted">
                      {typeName(establishment.type)} · {establishment.currency} · /e/
                      {establishment.slug}
                    </p>
                  </div>
                  <Badge tone={establishment.status === "active" ? "success" : "warning"}>
                    {establishment.status === "active" ? "Actif" : "Suspendu"}
                  </Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {establishment.modules.length === 0
                    ? "Aucun module actif."
                    : establishment.modules.map(moduleName).join(", ")}
                </p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Users aria-hidden className="size-4 text-text-muted" />
                    {establishment.staff} membre{establishment.staff > 1 ? "s" : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Smartphone aria-hidden className="size-4 text-text-muted" />
                    {establishment.devices} appareil{establishment.devices > 1 ? "s" : ""}
                  </span>
                </p>
                <div className="mt-auto pt-1">
                  <Link
                    href={`/proprietaire/etablissements/${establishment.id}`}
                    className={buttonClasses("outline", "sm")}
                    aria-label={`Gérer ${establishment.name}`}
                  >
                    Gérer
                    <ArrowRight aria-hidden />
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </OwnerFrame>
  );
}
