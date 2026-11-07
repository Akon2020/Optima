"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export const THEME_STORAGE_KEY = "optima:theme";

/**
 * Thèmes clair, sombre et système (D-010, docs/DESIGN_SYSTEM.md § 3).
 * next-themes pose `data-theme` sur <html> avant le premier rendu (pas de
 * flash), suit `prefers-color-scheme` et synchronise les onglets.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
      themes={["light", "dark"]}
    >
      {children}
    </NextThemesProvider>
  );
}
