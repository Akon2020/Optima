import Link from "next/link";

import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { BRAND, FOOTER, NAV_LINKS } from "../_content/landing";
import { BrandMark } from "./brand-mark";

/**
 * Pied de page public (docs/LANDING_PAGE.md § 3, ligne 10 ; D-068) :
 * logotype, ancres, coordonnées, mentions légales et sélecteur de thème.
 * `anchorsBase` préfixe les ancres hors de la page d'accueil (« / »).
 */
export function SiteFooter({ anchorsBase = "" }: { anchorsBase?: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <BrandMark />
          <p className="mt-2 text-sm text-text-muted">{BRAND.tagline}</p>
          <p className="mt-4 text-sm text-text-muted">{FOOTER.location}</p>
        </div>

        <nav aria-label="Plan du site">
          <ul className="space-y-1 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={`${anchorsBase}${link.href}`}
                  className="inline-flex min-h-9 items-center text-text-muted underline-offset-4 hover:text-text hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href={FOOTER.legal.href}
                className="inline-flex min-h-9 items-center text-text-muted underline-offset-4 hover:text-text hover:underline"
              >
                {FOOTER.legal.label}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="mb-3 text-sm text-text-muted">Thème d&apos;affichage</p>
          <ThemeSwitcher showLabels />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm text-text-muted sm:flex-row sm:justify-between sm:px-6">
          <span>{FOOTER.copyright}</span>
          <span>{FOOTER.locationShort}</span>
        </div>
      </div>
    </footer>
  );
}
