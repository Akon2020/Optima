import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** État vide conçu (CLAUDE.md § 3.10 : jamais d'écran blanc). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 py-10 text-center sm:py-14",
        className,
      )}
    >
      <span
        aria-hidden
        className="mb-4 grid size-14 place-items-center rounded-card bg-bg-subtle text-text-muted"
      >
        <Icon className="size-6" />
      </span>
      <p className="text-base font-medium">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Bloc de chargement neutre, qui suit le thème. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-bg-subtle", className)} />;
}
