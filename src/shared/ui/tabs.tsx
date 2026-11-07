"use client";

import type { LucideIcon } from "lucide-react";
import { useId, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
};

/**
 * Onglets icône + libellé (§ 5.5 « Onglets ») : l'actif est souligné de 2px.
 * Navigation au clavier par flèches (motif ARIA tablist).
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  trailing,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  trailing?: ReactNode;
}) {
  const baseId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.value === value);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.value);
    document.getElementById(`${baseId}-${item.value}`)?.focus();
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="scrollbar-none -mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto"
      >
        {items.map((item) => {
          const isActive = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              id={`${baseId}-${item.value}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {Icon ? <Icon aria-hidden className="size-4" /> : null}
              {item.label}
              {item.count !== undefined ? (
                <span className="text-xs text-text-muted tabular">{item.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}
