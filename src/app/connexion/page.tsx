import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/shared/ui/button";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

export const metadata: Metadata = { title: "Connexion" };

/** Page honnête tant que l'authentification (D-015) n'existe pas (docs/LANDING_PAGE.md § 3). */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center shadow-md">
        <span
          aria-hidden
          className="mx-auto grid size-12 place-items-center rounded-lg bg-primary-subtle text-primary"
        >
          <LockKeyhole className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Accès bientôt disponible</h1>
        <p className="mt-2 text-sm text-text-muted">
          La connexion à OPTIMA est en cours de réalisation. Les identifiants vous seront remis par
          le propriétaire ou par votre gérant.
        </p>
        <Link href="/" className={buttonClasses("outline", "md", "mt-6 w-full")}>
          <ArrowLeft aria-hidden />
          Retour à l&apos;accueil
        </Link>
      </div>
      <ThemeSwitcher showLabels />
    </main>
  );
}
