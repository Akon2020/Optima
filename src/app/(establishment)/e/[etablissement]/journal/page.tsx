import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { listAuditEntries } from "@/server/audit/journal";
import { isModuleEnabled } from "@/server/authz/modules";

import { AuditExportButton } from "../../../../_components/audit/audit-export-button";
import { AuditJournal, parseAuditQuery } from "../../../../_components/audit/audit-journal";
import { AccessDenied, ManagementFrame } from "../_components/management-frame";
import { guarded, managementContext } from "../_lib/management";

export const metadata: Metadata = { title: "Journal" };

/**
 * Journal d'audit d'un établissement (EF-AUD-02, EF-AUD-03) : le gérant et le
 * propriétaire, permission `core.audit.read` vérifiée côté serveur.
 */
export default function JournalPage({
  params,
  searchParams,
}: PageProps<"/e/[etablissement]/journal">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Journal params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Journal({
  params,
  searchParams,
}: {
  params: Promise<{ etablissement: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { etablissement: slug } = await params;
  const { db, actor, establishment, backHref } = await managementContext(slug);
  const query = parseAuditQuery(await searchParams);
  const result = await guarded(() =>
    listAuditEntries(db, actor, {
      scope: { kind: "establishment", establishmentId: establishment.id },
      filters: query.filters,
      before: query.before,
    }),
  );
  const hasRestaurant =
    result.data !== null && (await isModuleEnabled(db, establishment.id, "restaurant"));

  return (
    <ManagementFrame
      slug={slug}
      section="journal"
      title="Journal"
      description="qui a fait quoi, et quand. Le journal ne se modifie ni ne s'efface."
      establishmentName={establishment.name}
      backHref={backHref}
      hasRestaurant={hasRestaurant}
      action={
        result.data ? (
          <AuditExportButton
            input={{ scope: { kind: "establishment", slug }, filters: query.filters }}
          />
        ) : undefined
      }
    >
      {result.data ? (
        <AuditJournal
          basePath={`/e/${slug}/journal`}
          query={query}
          page={result.data}
          showEstablishments={false}
        />
      ) : (
        <AccessDenied message={result.denied} />
      )}
    </ManagementFrame>
  );
}
