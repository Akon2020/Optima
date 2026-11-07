"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/cn";

const OPTIONS = [
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
  { value: "system", label: "Système", Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

const subscribe = () => () => {};

/** Vrai une fois l'application hydratée (le thème réel n'est connu que côté client). */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Sélecteur de thème unique (docs/DESIGN_SYSTEM.md § 3.3) : contrôle segmenté
 * à trois options, navigable au clavier, `role="radiogroup"`.
 */
export function ThemeSwitcher({
  className,
  showLabels = false,
}: {
  className?: string;
  showLabels?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const isHydrated = useIsHydrated();
  const current: ThemeValue = isHydrated
    ? ((theme as ThemeValue | undefined) ?? "system")
    : "system";

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = OPTIONS.findIndex((option) => option.value === current);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % OPTIONS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    else return;
    event.preventDefault();
    const option = OPTIONS[next];
    if (!option) return;
    setTheme(option.value);
    const button = event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next];
    button?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Thème d'affichage"
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isChecked = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-label={showLabels ? undefined : label}
            title={label}
            tabIndex={isChecked ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors duration-150",
              isChecked
                ? "bg-action text-on-action"
                : "text-text-muted hover:bg-bg-subtle hover:text-text",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {showLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
