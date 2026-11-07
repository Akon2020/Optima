import type { Metadata } from "next";
import { Suspense } from "react";

import { DEMO_ESTABLISHMENT_SLUG } from "@/modules/restaurant";
import { RestaurantShell } from "@/modules/restaurant/components/shell/restaurant-shell";

export const metadata: Metadata = {
  title: { default: "Restaurant", template: "%s · Restaurant · OPTIMA" },
};

/** Établissements connus au build : la démonstration seulement pour l'instant. */
export function generateStaticParams() {
  return [{ etablissement: DEMO_ESTABLISHMENT_SLUG }];
}

/**
 * Espace Restaurant d'un établissement, sous la charte Restaurant (D-017).
 * HYPOTHÈSE D-018 : tant que l'authentification n'existe pas, ce layout ne
 * sert que l'établissement de démonstration, sans aucune donnée serveur. Le
 * contrôle côté serveur (session, appartenance, module actif, permission,
 * CLAUDE.md § 3.3) sera ajouté ici avec le socle serveur.
 */
export default function RestaurantLayout({
  children,
}: LayoutProps<"/e/[etablissement]/restaurant">) {
  // La coquille lit le paramètre d'établissement : pour un établissement non
  // prérendu, elle se résout au chargement, d'où cette frontière.
  return (
    <Suspense fallback={<div data-module="restaurant" className="min-h-dvh" />}>
      <RestaurantShell>{children}</RestaurantShell>
    </Suspense>
  );
}
