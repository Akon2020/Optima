import type { Metadata } from "next";

import { AuthCard } from "./_components/auth-card";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Connexion" };

/** Connexion (EF-AUT-01) : identifiants remis par le propriétaire ou le gérant. */
export default function LoginPage() {
  return (
    <AuthCard
      title="Connexion"
      description="Utilisez les identifiants remis par le propriétaire ou par votre gérant."
    >
      <LoginForm />
    </AuthCard>
  );
}
