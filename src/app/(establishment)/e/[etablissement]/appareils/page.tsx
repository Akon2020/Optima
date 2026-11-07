import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/shared/ui/empty-state";

import { listDevices } from "@/server/sync/devices";

import { AccessDenied, ManagementFrame } from "../_components/management-frame";
import { guarded, managementContext } from "../_lib/management";
import { DevicesScreen } from "./_components/devices-screen";

export const metadata: Metadata = { title: "Appareils" };

const DESCRIPTION =
  "téléphones et tablettes appairés. Un appareil perdu, volé ou remplacé se révoque ici.";

/**
 * Appareils d'un établissement (EF-CPT-04), pour le gérant et le propriétaire.
 * Écran en ligne, protégé par la session web : l'accès est vérifié côté
 * serveur par `authorize` (CLAUDE.md § 3.3), pas par le menu.
 */
export default function DevicesPage({ params }: PageProps<"/e/[etablissement]/appareils">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <Devices params={params} />
    </Suspense>
  );
}

async function Devices({ params }: { params: Promise<{ etablissement: string }> }) {
  const { etablissement: slug } = await params;
  const { db, actor, establishment, backHref } = await managementContext(slug);
  const result = await guarded(() => listDevices(db, actor, { establishmentId: establishment.id }));
  const hasRestaurant = result.data?.establishment.enabledModules.includes("restaurant") ?? false;

  return (
    <ManagementFrame
      slug={slug}
      section="appareils"
      title="Appareils"
      description={DESCRIPTION}
      establishmentName={establishment.name}
      backHref={backHref}
      hasRestaurant={hasRestaurant}
    >
      {result.data ? (
        <DevicesScreen
          slug={slug}
          timeZone={result.data.establishment.timeZone}
          nowIso={new Date().toISOString()}
          devices={result.data.devices}
          pairingPath={hasRestaurant ? `/e/${slug}/restaurant` : null}
        />
      ) : (
        <AccessDenied message={result.denied} />
      )}
    </ManagementFrame>
  );
}
