import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { listAuditEntries } from "@/server/audit/journal";

import { AuditExportButton } from "../../_components/audit/audit-export-button";
import { AuditJournal, parseAuditQuery } from "../../_components/audit/audit-journal";
import { OwnerFrame } from "../_components/owner-frame";
import { ownerPageContext } from "../_lib/owner";

export const metadata: Metadata = { title: "Journal d'audit" };

/**
 * Journal de tous les établissements (EF-AUD-03), connexions comprises, pour
 * le propriétaire. Filtrable et exportable (EF-AUD-02, EF-AUD-04).
 */
export default function OwnerAuditPage({ searchParams }: PageProps<"/proprietaire/audit">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <OwnerAudit searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerAudit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, actor } = await ownerPageContext();
  const query = parseAuditQuery(await searchParams);
  const page = await listAuditEntries(db, actor, {
    scope: { kind: "owner", establishmentId: query.establishmentId },
    filters: query.filters,
    before: query.before,
  });

  return (
    <OwnerFrame
      section="audit"
      title="Journal d'audit"
      description="Toutes les actions sensibles, de tous les établissements. Le journal ne se modifie ni ne s'efface."
      action={
        <AuditExportButton
          input={{
            scope: { kind: "owner", establishmentId: query.establishmentId },
            filters: query.filters,
          }}
        />
      }
    >
      <AuditJournal
        basePath="/proprietaire/audit"
        query={query}
        page={page}
        showEstablishments={true}
      />
    </OwnerFrame>
  );
}
