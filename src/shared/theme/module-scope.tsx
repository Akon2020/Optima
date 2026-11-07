"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** Identités visuelles de module disponibles (docs/DESIGN_SYSTEM.md § 2.4). */
export type ModuleIdentity = "restaurant";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Conteneur de portail courant. Les composants à portail (Sheet, Dialog...)
 * le passent à la prop `container` de Radix pour ne pas perdre la charte du
 * module (docs/DESIGN_SYSTEM.md § 2.3).
 */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

/**
 * Applique la charte d'un module à tout ce qui est rendu dessous, y compris
 * les portails, via l'attribut `data-module`.
 */
export function ModuleScope({
  module,
  className,
  children,
}: {
  module: ModuleIdentity;
  className?: string;
  children: ReactNode;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  return (
    <div data-module={module} className={cn("min-h-dvh", className)}>
      <PortalContainerContext.Provider value={portalRoot}>
        {children}
      </PortalContainerContext.Provider>
      <div data-portal-root="" ref={setPortalRoot} />
    </div>
  );
}
