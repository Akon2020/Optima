import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { LogoutButton } from "../../_components/logout-button";

export type OwnerSection = "overview" | "establishments" | "audit";

const SECTIONS: { id: OwnerSection; label: string; href: string }[] = [
  { id: "overview", label: "Vue d'ensemble", href: "/proprietaire" },
  { id: "establishments", label: "Établissements", href: "/proprietaire/etablissements" },
  { id: "audit", label: "Journal", href: "/proprietaire/audit" },
];

/** Cadre de l'espace propriétaire, en charte générale (D-008). */
export function OwnerFrame({
  section,
  title,
  description,
  action,
  back,
  children,
}: {
  section: OwnerSection;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/proprietaire" className="text-lg font-bold tracking-[0.2em] text-primary">
            OPTIMA
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
        <nav aria-label="Espace propriétaire" className="mx-auto max-w-6xl px-4 sm:px-6">
          <ul className="scrollbar-none flex gap-1 overflow-x-auto">
            {SECTIONS.map((item) => {
              const isActive = item.id === section;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
                      isActive
                        ? "border-primary text-text"
                        : "border-transparent text-text-muted hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {back ? (
          <Link
            href={back.href}
            className="mb-3 inline-flex min-h-11 items-center text-sm text-link hover:underline"
          >
            ← {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
          </div>
          {action}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
