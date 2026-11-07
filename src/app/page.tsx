import { ArrowRight, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { DEMO_ESTABLISHMENT_SLUG } from "@/modules/restaurant";
import { buttonClasses } from "@/shared/ui/button";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

/**
 * Page d'accueil provisoire, en charte générale. La landing page complète
 * (docs/LANDING_PAGE.md) vient après le module Restaurant (D-018).
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-lg font-bold tracking-[0.2em] text-primary">OPTIMA</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeSwitcher />
            <Link href="/connexion" className={buttonClasses("action", "sm")}>
              Se connecter
            </Link>
          </div>
        </div>
      </header>

      <main id="contenu" className="flex-1">
        <section className="bg-surface-inverse text-text-inverse">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-sm font-medium tracking-wide text-text-inverse-muted uppercase">
              Logiciel de gestion commerciale multi-établissements
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl leading-tight font-bold sm:text-5xl">
              Tous vos établissements, un seul outil de gestion.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-text-inverse-muted sm:text-lg">
              Caisse, stock, commandes et clôtures, même sans connexion. Chaque établissement garde
              ses données, le propriétaire voit l&apos;ensemble.
            </p>
          </div>
        </section>

        <section aria-labelledby="demo-title" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-6 rounded-xl border border-border bg-bg-subtle p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary"
              >
                <UtensilsCrossed className="size-6" />
              </span>
              <div>
                <h2 id="demo-title" className="text-lg font-semibold">
                  Module Restaurant, en développement
                </h2>
                <p className="mt-1 max-w-xl text-sm text-text-muted">
                  Aperçu de l&apos;interface sur des données de démonstration enregistrées
                  uniquement dans ce navigateur. Aucune donnée réelle n&apos;est utilisée.
                </p>
              </div>
            </div>
            <Link
              href={`/e/${DEMO_ESTABLISHMENT_SLUG}/restaurant`}
              className={buttonClasses("action", "md", "self-start sm:self-auto")}
            >
              Ouvrir l&apos;aperçu
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 OPTIMA</span>
          <span>Mentions légales [À COMPLÉTER : D-Q26]</span>
        </div>
      </footer>
    </div>
  );
}
