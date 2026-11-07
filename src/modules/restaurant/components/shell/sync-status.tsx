"use client";

import { CloudUpload, Wifi, WifiOff } from "lucide-react";

import { cn } from "@/shared/lib/cn";

import { useIsOnline, usePendingOperations } from "../../offline/hooks";

/**
 * Bandeau d'état de synchronisation (EF-OFF-02). Le serveur de
 * synchronisation n'est pas encore branché (D-018) : les opérations restent
 * en attente, et l'infobulle le dit.
 */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const isOnline = useIsOnline();
  const pending = usePendingOperations();

  const label = isOnline
    ? pending === 0
      ? "En ligne, tout est synchronisé"
      : `En ligne, ${pending} opération${pending > 1 ? "s" : ""} en attente`
    : `Hors ligne, ${pending} opération${pending > 1 ? "s" : ""} en attente`;

  const Icon = !isOnline ? WifiOff : pending > 0 ? CloudUpload : Wifi;

  return (
    <span
      role="status"
      aria-live="polite"
      title={`${label}. L'envoi au serveur sera actif avec le socle serveur.`}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
        isOnline
          ? "border-border bg-surface text-text-muted"
          : "border-warning bg-warning-subtle text-text",
      )}
    >
      <Icon aria-hidden className={cn("size-4", isOnline && pending === 0 && "text-success")} />
      {compact ? (
        <>
          <span className="tabular">{pending}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}
