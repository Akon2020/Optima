import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { listStaff } from "@/server/staff/staff";

import { AccessDenied, ManagementFrame } from "../_components/management-frame";
import { guarded, managementContext } from "../_lib/management";
import { StaffScreen } from "./_components/staff-screen";

export const metadata: Metadata = { title: "Équipe" };

/**
 * Comptes et rôles d'un établissement (EF-CPT-02) : le gérant gère son
 * personnel, le propriétaire gère aussi les gérants. Accès vérifié côté
 * serveur par `authorize` (permission `core.staff.manage`).
 */
export default function StaffPage({ params }: PageProps<"/e/[etablissement]/equipe">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <Staff params={params} />
    </Suspense>
  );
}

async function Staff({ params }: { params: Promise<{ etablissement: string }> }) {
  const { etablissement: slug } = await params;
  const { db, actor, establishment, backHref } = await managementContext(slug);
  const result = await guarded(() => listStaff(db, actor, { establishmentId: establishment.id }));
  const hasRestaurant = result.data?.establishment.enabledModules.includes("restaurant") ?? false;

  return (
    <ManagementFrame
      slug={slug}
      section="equipe"
      title="Équipe"
      description="comptes du personnel, rôles et accès."
      establishmentName={establishment.name}
      backHref={backHref}
      hasRestaurant={hasRestaurant}
    >
      {result.data ? (
        <StaffScreen slug={slug} nowIso={new Date().toISOString()} overview={result.data} />
      ) : (
        <AccessDenied message={result.denied} />
      )}
    </ManagementFrame>
  );
}
