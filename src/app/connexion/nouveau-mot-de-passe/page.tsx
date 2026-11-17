import type { Metadata } from "next";

import { AuthCard } from "../_components/auth-card";
import { PasswordForm } from "../_components/password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/** Changement obligatoire du mot de passe provisoire (EF-AUT-02). */
export default function NewPasswordPage() {
  return (
    <AuthCard
      title="Choisissez votre mot de passe"
      description="Le mot de passe provisoire ne sert qu'une fois. Personne d'autre que vous ne pourra relire le nouveau."
    >
      <PasswordForm />
    </AuthCard>
  );
}
