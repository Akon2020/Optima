import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "accent";

const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
  accent: "bg-accent",
};

/**
 * Statut : pastille de 8px suivie d'un libellé. Jamais la couleur seule
 * (docs/DESIGN_SYSTEM.md § 5.5 et § 8).
 */
export function StatusLabel({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm whitespace-nowrap", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

const PILL: Record<StatusTone, string> = {
  success: "bg-success-subtle text-text",
  warning: "bg-warning-subtle text-text",
  danger: "bg-danger-subtle text-text",
  neutral: "bg-bg-subtle text-text-muted",
  accent: "bg-accent-subtle text-text",
};

/** Étiquette compacte avec pastille, pour les cartes et les en-têtes. */
export function Badge({
  tone = "neutral",
  children,
  className,
  withDot = true,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  withDot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {withDot ? <span aria-hidden className={cn("size-1.5 rounded-full", DOT[tone])} /> : null}
      {children}
    </span>
  );
}

/** Compteur arrondi (ex. nombre de commandes ouvertes dans la navigation). */
export function CountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-badge-bg px-1.5 text-[11px] font-semibold text-badge-text tabular",
        className,
      )}
    >
      {children}
    </span>
  );
}
