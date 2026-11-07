import type { Metadata } from "next";

import { AuthCard } from "../_components/auth-card";
import { TotpVerifyForm } from "../_components/totp-verify-form";

export const metadata: Metadata = { title: "Double authentification" };

/** Double authentification du propriétaire (EF-AUT-03). */
export default function SecondFactorPage() {
  return (
    <AuthCard
      title="Double authentification"
      description="Ouvrez votre application d'authentification et saisissez le code affiché pour OPTIMA."
    >
      <TotpVerifyForm />
    </AuthCard>
  );
}
