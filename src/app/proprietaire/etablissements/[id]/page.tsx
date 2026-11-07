import { Smartphone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DomainError } from "@/shared/lib/errors";
import { Badge } from "@/shared/ui/badge";
import { buttonClasses } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/empty-state";

import { getEstablishment } from "@/server/owner/establishments";

import { OwnerFrame } from "../../_components/owner-frame";
import { ownerPageContext } from "../../_lib/owner";
import { IdentityPanel, ModulesPanel, StatusPanel } from "./_components/establishment-panels";

export const metadata: Metadata = { title: "Établissement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Fiche d'un établissement pour le propriétaire (EF-ETB-01 à 03, EF-MOD-01). */
export default function EstablishmentPage({
  params,
  searchParams,
}: PageProps<"/proprietaire/etablissements/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Establishment params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Establishment({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, actor } = await ownerPageContext();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const isNew = (await searchParams).cree === "1";

  let establishment;
  try {
    establishment = await getEstablishment(db, actor, { establishmentId: id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <OwnerFrame
      section="establishments"
      title={establishment.name}
      description={`${establishment.typeName} · ${establishment.currency} · /e/${establishment.slug}`}
      back={{ href: "/proprietaire/etablissements", label: "Établissements" }}
      action={
        <Badge tone={establishment.status === "active" ? "success" : "warning"}>
          {establishment.status === "active" ? "Actif" : "Suspendu"}
        </Badge>
      }
    >
      <div className="flex flex-col gap-6">
        {isNew ? (
          <p role="status" className="rounded-md bg-success-subtle px-4 py-3 text-sm">
            Établissement créé. Étape suivante : créez le compte du gérant dans « Équipe ».
          </p>
        ) : null}
        <Card aria-labelledby="access-title">
          <CardHeader
            title="Personnel et appareils"
            titleId="access-title"
            description="Vos actions dans l'établissement sont inscrites à son journal d'audit, visible du gérant."
          />
          <div className="flex flex-wrap gap-3">
            <Link href={`/e/${establishment.slug}/equipe`} className={buttonClasses("outline")}>
              <Users aria-hidden />
              Équipe ({establishment.staff})
            </Link>
            <Link href={`/e/${establishment.slug}/appareils`} className={buttonClasses("outline")}>
              <Smartphone aria-hidden />
              Appareils ({establishment.devices})
            </Link>
          </div>
        </Card>
        <IdentityPanel establishment={establishment} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ModulesPanel establishment={establishment} />
          <StatusPanel establishment={establishment} />
        </div>
        <p className="text-xs text-text-muted">
          Export des données et suppression définitive (EF-ETB-04, EF-ETB-05) : à venir, avec les
          tâches de fond.
        </p>
      </div>
    </OwnerFrame>
  );
}
