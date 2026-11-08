import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { ModuleScope } from "@/shared/theme/module-scope";
import { ThemeSwitcher } from "@/shared/theme/theme-switcher";

import { LogoutButton } from "../../../../_components/logout-button";

export type ManagementSection = "equipe" | "appareils" | "journal";

const SECTIONS: { id: ManagementSection; label: string }[] = [
  { id: "equipe", label: "Équipe" },
  { id: "appareils", label: "Appareils" },
  { id: "journal", label: "Journal" },
];

/**
 * Cadre des écrans de gestion en ligne d'un établissement (équipe, appareils),
 * sous la charte Restaurant quand le module est actif (D-017).
 */
export function ManagementFrame({
  slug,
  section,
  title,
  description,
  establishmentName,
  backHref,
  hasRestaurant = false,
  action,
  children,
}: {
  slug: string;
  section: ManagementSection;
  title: string;
  description: string;
  establishmentName?: string | undefined;
  backHref: string;
  hasRestaurant?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const content = (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href={backHref} className={buttonClasses("ghost", "sm", "-ml-2")}>
            <ArrowLeft aria-hidden />
            Retour
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
        <nav aria-label="Gestion de l'établissement" className="mx-auto max-w-6xl px-4 sm:px-6">
          <ul className="flex gap-1">
            {SECTIONS.map((item) => {
              const isActive = item.id === section;
              return (
                <li key={item.id}>
                  <Link
                    href={`/e/${slug}/${item.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium",
                      isActive
                        ? "border-text text-text"
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {establishmentName ? `${establishmentName} · ` : ""}
              {description}
            </p>
          </div>
          {action}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
  return hasRestaurant ? <ModuleScope module="restaurant">{content}</ModuleScope> : content;
}

/** Accès refusé par `authorize` : message métier, sans détail technique. */
export function AccessDenied({ message }: { message: string }) {
  return (
    <Card>
      <EmptyState icon={ShieldAlert} title="Accès réservé au gérant" description={message} />
    </Card>
  );
}
