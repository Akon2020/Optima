"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";

import { NAV_ITEMS, restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";

const DESCRIPTIONS: Record<string, string> = {
  tables: "Création et numérotation des tables par le gérant (EF-RES-04).",
  "stock-du-matin":
    "Saisie du stock de chaque point de service, proposée à partir de la clôture de la veille et de la réquisition (EF-REQ-03, EF-REQ-04).",
  requisitions:
    "Sorties quotidiennes du magasin vers le comptoir, la cuisine et la grillade (EF-REQ-02).",
  clotures:
    "Montant attendu calculé à partir des souches, montant compté, écart figé et validation du gérant (EF-CLO-01 à 05).",
  livraisons: "Commandes livrées, livreurs et statuts (EF-LIV-01 à 04), après réponse à D-Q07.",
};

/** Écran pas encore réalisé : on le dit honnêtement, sans fausse interface. */
export function UpcomingScreen({ segment }: { segment: string }) {
  const { slug } = useRestaurant();
  const item = NAV_ITEMS.find((entry) => entry.segment === segment);
  const Icon = item?.icon ?? ArrowLeft;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{item?.label}</h1>
      <Card>
        <EmptyState
          icon={Icon}
          title="Écran en cours de réalisation"
          description={DESCRIPTIONS[segment]}
          action={
            <Link href={restaurantHref(slug, "")} className={buttonClasses("outline")}>
              <ArrowLeft aria-hidden />
              Retour au tableau de bord
            </Link>
          }
        />
      </Card>
    </div>
  );
}
