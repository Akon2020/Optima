"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudUpload, RefreshCw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { formatTime } from "@/shared/lib/dates";
import { Button } from "@/shared/ui/button";
import { Sheet } from "@/shared/ui/sheet";

import { useIsOnline, usePendingOperations } from "../../offline/hooks";
import { useRestaurant } from "../restaurant-provider";

const OPERATION_LABELS: Record<string, string> = {
  "restaurant.order.created": "Commande",
  "restaurant.invoice.prep-status-changed": "Statut de préparation",
  "restaurant.menu-item.created": "Élément de menu",
  "restaurant.morning-stock.entered": "Stock du matin",
  "restaurant.table.created": "Nouvelle table",
  "restaurant.table.renamed": "Table renommée",
  "restaurant.table.archived": "Table retirée",
  "restaurant.table.restored": "Table remise en service",
  "restaurant.table.released": "Table libérée",
};

/**
 * État de synchronisation (EF-OFF-02) et refus du serveur (EF-OFF-04) : un
 * refus n'est jamais silencieux, il reste listé avec son motif.
 */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { db, isDemo, sync, syncNow } = useRestaurant();
  const isOnline = useIsOnline();
  const pending = usePendingOperations();
  const rejected =
    useLiveQuery(
      () => db.outbox.where("status").equals("rejected").reverse().sortBy("createdAt"),
      [db],
    ) ?? [];
  const [isOpen, setIsOpen] = useState(false);

  const plural = (count: number) => (count > 1 ? "s" : "");
  const label = !isOnline
    ? `Hors ligne, ${pending} opération${plural(pending)} en attente`
    : rejected.length > 0
      ? `${rejected.length} opération${plural(rejected.length)} refusée${plural(rejected.length)}`
      : pending > 0
        ? `En ligne, ${pending} opération${plural(pending)} en attente`
        : "En ligne, tout est synchronisé";
  const detail = isDemo
    ? "Démonstration : rien n'est envoyé au serveur."
    : sync.state === "error"
      ? `Erreur : ${sync.error ?? "synchronisation impossible"}`
      : sync.lastSyncAt
        ? `Dernière synchronisation à ${formatTime(sync.lastSyncAt)}`
        : "Synchronisation en cours…";

  const Icon = !isOnline
    ? WifiOff
    : rejected.length > 0 || sync.state === "error"
      ? TriangleAlert
      : pending > 0
        ? CloudUpload
        : Wifi;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={`${label}. ${detail}`}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
          !isOnline || rejected.length > 0 || sync.state === "error"
            ? "border-warning bg-warning-subtle text-text"
            : "border-border bg-surface text-text-muted",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-4",
            isOnline && pending === 0 && rejected.length === 0 && "text-success",
            sync.state === "syncing" && "animate-pulse",
          )}
        />
        {compact ? (
          <span className="tabular">{rejected.length > 0 ? `!${rejected.length}` : pending}</span>
        ) : (
          <span>{label}</span>
        )}
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
      </button>

      <Sheet open={isOpen} onOpenChange={setIsOpen} title="Synchronisation" description={detail}>
        <div className="flex flex-col gap-4">
          <p className="text-sm">{label}.</p>
          {isDemo ? null : (
            <Button
              variant="outline"
              onClick={syncNow}
              disabled={!isOnline || sync.state === "syncing"}
              className="self-start"
            >
              <RefreshCw aria-hidden />
              Synchroniser maintenant
            </Button>
          )}
          {rejected.length > 0 ? (
            <section aria-labelledby="rejected-title">
              <h3 id="rejected-title" className="mb-2 text-sm font-semibold">
                Opérations refusées par le serveur
              </h3>
              <p className="mb-3 text-xs text-text-muted">
                Elles restent enregistrées sur cet appareil et côté serveur pour revue par le
                gérant.
              </p>
              <ul className="flex flex-col gap-2">
                {rejected.map((operation) => (
                  <li key={operation.id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium">
                      {OPERATION_LABELS[operation.type] ?? operation.type}
                      <span className="ml-2 text-xs font-normal text-text-muted tabular">
                        {formatTime(operation.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 text-text-muted">
                      {operation.rejection?.message ?? "Refusée sans motif."}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
