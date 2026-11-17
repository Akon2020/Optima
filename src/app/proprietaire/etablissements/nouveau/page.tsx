import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { OwnerFrame } from "../../_components/owner-frame";
import { ownerPageContext } from "../../_lib/owner";
import { CreateEstablishmentForm } from "../_components/create-establishment-form";

export const metadata: Metadata = { title: "Nouvel établissement" };

/** Création d'un établissement (EF-ETB-01, EF-ETB-02). */
export default function NewEstablishmentPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <NewEstablishment />
    </Suspense>
  );
}

async function NewEstablishment() {
  await ownerPageContext();
  return (
    <OwnerFrame
      section="establishments"
      title="Nouvel établissement"
      description="Ses données resteront strictement séparées de celles des autres établissements."
      back={{ href: "/proprietaire/etablissements", label: "Établissements" }}
    >
      <CreateEstablishmentForm />
    </OwnerFrame>
  );
}
