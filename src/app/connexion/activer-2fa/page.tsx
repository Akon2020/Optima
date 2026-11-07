import type { Metadata } from "next";

import { AuthCard } from "../_components/auth-card";
import { TotpSetup } from "../_components/totp-setup";

export const metadata: Metadata = { title: "Activer la double authentification" };

/** Activation obligatoire de la double authentification du propriétaire (EF-AUT-03). */
export default function TotpSetupPage() {
  return (
    <AuthCard
      title="Activez la double authentification"
      description="Obligatoire pour le compte du propriétaire : un code du téléphone sera demandé à chaque connexion."
    >
      <TotpSetup />
    </AuthCard>
  );
}
