"use client";

import { Menu, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/cn";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";
import { buttonClasses } from "@/shared/ui/button";
import { Sheet } from "@/shared/ui/sheet";

import { DEMO, LOGIN, NAV_LINKS } from "../_content/landing";
import { BrandMark } from "./brand-mark";

/** Au-delà de cette hauteur de défilement, la barre devient opaque. */
const SOLID_AFTER_PX = 24;

/**
 * En-tête public (docs/LANDING_PAGE.md § 3, ligne 1) : barre flottante en
 * pilule, collante, plus opaque au défilement. Sur la page d'accueil, la
 * section en cours de lecture est marquée d'une pastille. Sur mobile, les
 * ancres passent dans un tiroir (Radix Dialog : piège du focus, Échap).
 * `anchorsBase` préfixe les ancres hors de la page d'accueil (« / »).
 */
export function SiteHeader({ anchorsBase = "" }: { anchorsBase?: string }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Radix ne rend le focus qu'à son propre déclencheur : le tiroir étant
  // piloté, le focus revient ici au bouton du menu après Échap ou « Fermer ».
  function onMenuOpenChange(isOpen: boolean) {
    setIsMenuOpen(isOpen);
    if (!isOpen) requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > SOLID_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Section en cours : celle qui traverse le milieu de l'écran.
  useEffect(() => {
    if (anchorsBase || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveHref(`#${entry.target.id}`);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const link of NAV_LINKS) {
      const section = document.getElementById(link.href.slice(1));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [anchorsBase]);

  return (
    <>
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-sm font-medium text-text shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
        <div
          className={cn(
            "mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border pr-2 pl-5 backdrop-blur-md transition-[background-color,box-shadow,border-color] duration-300",
            isScrolled
              ? "border-border bg-surface/90 shadow-md"
              : "border-border/60 bg-surface/70 shadow-sm",
          )}
        >
          <BrandMark withTagline />

          <nav aria-label="Sections de la page" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = activeHref === link.href;
                return (
                  <li key={link.href}>
                    <a
                      href={`${anchorsBase}${link.href}`}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors",
                        isActive ? "text-brand-text" : "text-text-muted hover:text-text",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full bg-accent transition-[opacity,scale] duration-300",
                          isActive ? "scale-100 opacity-100" : "scale-0 opacity-0",
                        )}
                      />
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {/* `cn` ne fusionne pas les classes : l'affichage se règle sur un conteneur. */}
            <div className="hidden xl:block">
              <ThemeSwitcher />
            </div>
            <div className="hidden md:block">
              <Link href={DEMO.href} className={buttonClasses("outline", "sm", "rounded-full!")}>
                <Play aria-hidden />
                {DEMO.label}
              </Link>
            </div>
            <Link href={LOGIN.href} className={buttonClasses("action", "sm", "rounded-full!")}>
              {LOGIN.label}
            </Link>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Ouvrir le menu"
              aria-haspopup="dialog"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(true)}
              className="grid size-10 place-items-center rounded-full text-text-muted hover:bg-bg-subtle hover:text-text lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <Sheet open={isMenuOpen} onOpenChange={onMenuOpenChange} title="Menu">
        <nav aria-label="Sections de la page">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={`${anchorsBase}${link.href}`}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex min-h-12 items-center rounded-md px-3 text-base text-text hover:bg-bg-subtle"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href={DEMO.href}
          className={buttonClasses("outline", "md", "mt-4 w-full rounded-full!")}
        >
          <Play aria-hidden />
          {DEMO.label}
        </Link>
        <div className="mt-6 border-t border-border pt-6">
          <p className="mb-3 text-sm text-text-muted">Thème d&apos;affichage</p>
          <ThemeSwitcher showLabels />
        </div>
      </Sheet>
    </>
  );
}
