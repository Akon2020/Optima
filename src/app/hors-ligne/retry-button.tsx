"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/shared/ui/button";

/** Nouvel essai : recharge la page demandée, qui répondra dès que le réseau revient. */
export function RetryButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      Réessayer
    </Button>
  );
}
