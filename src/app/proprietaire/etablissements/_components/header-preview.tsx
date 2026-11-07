import { TriangleAlert } from "lucide-react";

import { missingHeaderFields, type EstablishmentIdentity } from "@/modules/owner";

/**
 * EF-ETB-02 : l'en-tête tel qu'il sera imprimé sur les tickets et factures,
 * toujours en clair comme le papier, avec les champs encore manquants.
 */
export function HeaderPreview({ identity }: { identity: EstablishmentIdentity }) {
  const missing = missingHeaderFields(identity);
  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label="Aperçu de l'en-tête imprimé"
        role="img"
        className="mx-auto w-full max-w-[320px] rounded-sm border border-dashed border-ticket-border bg-ticket-bg p-4 text-center font-mono text-[12px] leading-relaxed text-ticket-ink"
      >
        <p className="text-[13px] font-bold break-words uppercase">
          {identity.name.trim() || "Nom de l'établissement"}
        </p>
        {identity.legalName ? <p className="break-words">{identity.legalName}</p> : null}
        {identity.address ? <p className="break-words">{identity.address}</p> : null}
        {identity.phone ? <p>Tél. {identity.phone}</p> : null}
        <hr className="my-2 border-dashed border-ticket-border" />
        <p>FACTURE FAC-2026-D01-000001</p>
      </div>
      {missing.length > 0 ? (
        <p className="flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Manquant sur l&apos;en-tête : {missing.join(", ").toLowerCase()}. Le logo viendra avec
            le stockage des fichiers (D-Q23).
          </span>
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          En-tête complet. Le logo viendra avec le stockage des fichiers (D-Q23).
        </p>
      )}
    </div>
  );
}
