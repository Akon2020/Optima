"use client";

import { Ban, Check, ChefHat, RotateCcw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { formatElapsed } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";

import {
  canWorkStation,
  isDeclaredSoldOut,
  pointForStation,
  stationQueue,
  stationSlug,
} from "../../domain/preparation";
import type { AdvanceInvoice, MenuItem, ServicePoint } from "../../domain/types";
import { useDayData, useIsOnline, type DayData } from "../../offline/hooks";
import { setInvoicePrepStatus, setItemSoldOut } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { SERVICE_POINT_ICONS, orderLineDetail, orderPlaceLabel } from "../labels";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";

/** RG-PRE-02 : l'écran du poste reçoit les commandes par le réseau, souvent. */
const STATION_SYNC_MS = 5_000;

/**
 * Postes de préparation (EF-PRE-01 à 03, RG-PRE-01, RG-PRE-02, D-066) :
 * sans poste choisi, la liste des postes ; sur un poste, ses commandes dans
 * l'ordre d'arrivée, sans aucun montant, et les éléments à déclarer épuisés.
 */
export function PreparationScreen({ station }: { station?: string }) {
  const { ctx } = useRestaurant();
  const data = useDayData();
  if (!data) return null;
  const own = data.staff.find((member) => member.id === ctx.userId)?.servicePointId ?? null;
  const point = station ? pointForStation(station, data.servicePoints) : undefined;

  if (!station) return <StationPicker data={data} ownServicePointId={own} />;
  if (!point) {
    return (
      <Card>
        <EmptyState
          icon={ChefHat}
          title="Poste introuvable"
          description="Ce poste de préparation n'existe pas dans cet établissement."
        />
      </Card>
    );
  }
  if (!canWorkStation(ctx.role, own, point.id)) {
    return (
      <Card>
        <EmptyState
          icon={Ban}
          title="Ce poste n'est pas le vôtre"
          description="Un préparateur ne travaille que pour son poste ; le gérant pour tous."
        />
      </Card>
    );
  }
  return <Station data={data} point={point} />;
}

function StationPicker({
  data,
  ownServicePointId,
}: {
  data: DayData;
  ownServicePointId: string | null;
}) {
  const { slug, ctx } = useRestaurant();
  const points = data.servicePoints.filter((point) =>
    canWorkStation(ctx.role, ownServicePointId, point.id),
  );
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Préparation</h1>
        <p className="text-sm text-text-muted">
          Choisissez le poste affiché sur cet écran (comptoir, cuisine ou grillade).
        </p>
      </div>
      {points.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ban}
            title="Aucun poste pour vous"
            description="Seuls le gérant et les préparateurs travaillent sur un poste."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {points.map((point) => {
            const Icon = SERVICE_POINT_ICONS[point.kind];
            const pending = stationQueue(data.invoices, point.id).pending.length;
            return (
              <li key={point.id}>
                <Link
                  href={restaurantHref(slug, `preparation/${stationSlug(point)}`)}
                  className="flex min-h-24 items-center gap-4 rounded-card bg-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
                >
                  <Icon aria-hidden className="size-8 text-text-muted" />
                  <span>
                    <span className="block text-lg font-semibold">{point.name}</span>
                    <span className="text-sm text-text-muted">
                      {pending} commande{pending > 1 ? "s" : ""} à préparer
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Station({ data, point }: { data: DayData; point: ServicePoint }) {
  const { db, ctx, isDemo, syncNow } = useRestaurant();
  const isOnline = useIsOnline();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const queue = stationQueue(data.invoices, point.id);
  const canDeclare = hasPermission(ctx.role, "restaurant.menu.sold-out");
  const items = data.menuItems
    .filter(
      (item) =>
        item.servicePointId === point.id &&
        item.archivedAt === null &&
        item.kind !== "formula" &&
        item.price !== null,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // RG-PRE-02 : tant que l'écran est ouvert et en ligne, il reçoit les commandes toutes les 5 s.
  useEffect(() => {
    if (isDemo || !isOnline) return;
    const id = window.setInterval(syncNow, STATION_SYNC_MS);
    return () => window.clearInterval(id);
  }, [isDemo, isOnline, syncNow]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      if (!isDemo && isOnline) syncNow();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">Poste de préparation</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{point.name}</h1>
        </div>
        <Badge tone={queue.pending.length > 0 ? "warning" : "success"}>
          {queue.pending.length} à préparer
        </Badge>
      </div>

      {!isOnline && !isDemo ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm"
        >
          <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          Pas de connexion : les nouvelles commandes n&apos;arrivent plus ici. Servez-vous des
          factures d&apos;avance imprimées (RG-PRE-02).
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="pending-title">
        <h2 id="pending-title" className="sr-only">
          À préparer
        </h2>
        {queue.pending.length === 0 ? (
          <Card>
            <EmptyState
              icon={ChefHat}
              title="Rien à préparer"
              description="Les nouvelles commandes de ce poste s'afficheront ici, la plus ancienne d'abord."
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queue.pending.map((invoice) => (
              <li key={invoice.id}>
                <TicketCard
                  invoice={invoice}
                  nowIso={data.now}
                  action={
                    <Button
                      variant="action"
                      size="lg"
                      className="w-full"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(invoice.id, () =>
                          setInvoicePrepStatus(db, ctx, invoice.id, "ready"),
                        )
                      }
                    >
                      <Check aria-hidden />
                      {busy === invoice.id ? "Envoi…" : "Prête"}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card aria-labelledby="ready-title">
          <CardHeader
            titleId="ready-title"
            title="Prêtes, à servir"
            description="Le serveur en est averti sur son appareil (EF-PRE-02)."
          />
          {queue.ready.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune commande en attente de service.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {queue.ready.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">
                      {orderPlaceLabel(invoice.mode, invoice.tableLabel)}
                    </span>{" "}
                    <span className="text-text-muted">
                      · {invoice.waiterName} · {invoice.number}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(invoice.id, () =>
                        setInvoicePrepStatus(db, ctx, invoice.id, "pending"),
                      )
                    }
                    aria-label={`Remettre en préparation : ${orderPlaceLabel(invoice.mode, invoice.tableLabel)}`}
                    className="max-sm:h-11"
                  >
                    <RotateCcw aria-hidden />
                    <span className="sr-only sm:not-sr-only">Annuler</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canDeclare ? (
          <SoldOutCard
            items={items}
            day={data.day}
            busy={busy}
            onToggle={(item, isSoldOut) =>
              void run(`sold-out-${item.id}`, () => setItemSoldOut(db, ctx, item.id, isSoldOut))
            }
          />
        ) : null}
      </div>
    </div>
  );
}

/** Ticket d'une commande à préparer : quantités et éléments, jamais de montant (RG-PRE-01). */
function TicketCard({
  invoice,
  nowIso,
  action,
}: {
  invoice: AdvanceInvoice;
  nowIso: string;
  action: ReactNode;
}) {
  return (
    <article
      aria-label={`${orderPlaceLabel(invoice.mode, invoice.tableLabel)}, ${invoice.number}`}
      className="flex h-full flex-col gap-3 rounded-card bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">
            {orderPlaceLabel(invoice.mode, invoice.tableLabel)}
          </p>
          <p className="text-xs text-text-muted">
            {invoice.number} · {invoice.waiterName}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular">
          {formatElapsed(invoice.createdAt, nowIso)}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-base">
        {invoice.lines.map((line, index) => (
          <li key={`${line.menuItemId}-${index}`}>
            <span className="font-semibold tabular">{line.quantity} ×</span> {line.name}
            {orderLineDetail(line) ? (
              <span className="block text-sm text-text-muted">{orderLineDetail(line)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-auto">{action}</div>
    </article>
  );
}

/** EF-PRE-03 : déclarer un élément épuisé pour la journée, ou le remettre en vente. */
function SoldOutCard({
  items,
  day,
  busy,
  onToggle,
}: {
  items: MenuItem[];
  day: string;
  busy: string | null;
  onToggle: (item: MenuItem, isSoldOut: boolean) => void;
}) {
  return (
    <Card aria-labelledby="sold-out-title">
      <CardHeader
        titleId="sold-out-title"
        title="Éléments épuisés"
        description="Un élément épuisé disparaît aussitôt de la prise de commande, jusqu'à la fin de la journée."
      />
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun élément vendable à ce poste.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {items.map((item) => {
            const isSoldOut = isDeclaredSoldOut(item, day);
            return (
              <li key={item.id} className="flex min-h-12 items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="font-medium">{item.name}</span>
                  {isSoldOut ? (
                    <Badge tone="danger" className="ml-2 text-[10px]">
                      Épuisé
                    </Badge>
                  ) : null}
                </span>
                <Button
                  variant={isSoldOut ? "outline" : "ghost"}
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => onToggle(item, !isSoldOut)}
                  className="max-sm:h-11"
                >
                  {isSoldOut ? "Remettre en vente" : "Déclarer épuisé"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
