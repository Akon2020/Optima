"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { usePortalContainer } from "@/shared/theme/module-scope";

/**
 * Panneau latéral (§ 5.5 « Panneau de formulaire ») : s'ouvre depuis la droite
 * (ou la gauche pour la navigation), plein écran sur mobile. Le portail est
 * rendu dans le conteneur du module pour conserver sa charte (§ 2.3).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  side?: "right" | "left";
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const container = usePortalContainer();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-y-0 z-50 flex w-full flex-col bg-surface-raised text-text shadow-raised outline-none sm:w-[440px]",
            side === "right"
              ? "right-0 data-[state=open]:animate-slide-in-right sm:rounded-l-card"
              : "left-0 max-w-[320px] data-[state=open]:animate-slide-in-left sm:w-[300px] rounded-r-card",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Fermer"
              className="-mr-2 grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer ? (
            <div className="border-t border-border px-5 py-4 pb-safe sm:px-6">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
