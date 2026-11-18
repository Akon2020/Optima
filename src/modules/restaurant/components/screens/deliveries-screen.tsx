"use client";

import { Archive, ArchiveRestore, Bike, MapPin, Pencil, Phone, Plus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { formatLongDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, toMajor } from "@/shared/lib/money";
import { Badge, type StatusTone } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input, Select } from "@/shared/ui/field";
import { Tabs } from "@/shared/ui/tabs";

import {
  DELIVERY_OUTCOME_LABELS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_TRANSITIONS,
  canCollectFor,
  courierQueue,
} from "../../domain/delivery";
import { remainingDue } from "../../domain/payment";
import type { Delivery, DeliveryStatus, DeliveryZone } from "../../domain/types";
import { useDayData, type DayData } from "../../offline/hooks";
import {
  assignDelivery,
  saveDeliveryZone,
  setDeliveryStatus,
  setDeliveryZoneArchived,
  settleFailedDelivery,
} from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { PaymentSheet } from "../payments/payment-sheet";
import { useRestaurant } from "../restaurant-provider";

type View = "open" | "mine" | "done" | "zones";

const STATUS_TONES: Record<DeliveryStatus, StatusTone> = {
  preparing: "neutral",
  "en-route": "accent",
  delivered: "success",
  failed: "danger",
};

const EVENT_LABELS: Record<Delivery["events"][number]["kind"], string> = {
  ...DELIVERY_STATUS_LABELS,
  preparing: "Commande prise",
  assigned: "Attribuée",
  settled: "Échec réglé",
};

const isOpen = (delivery: Delivery) =>
  delivery.status === "preparing" || delivery.status === "en-route";

/**
 * Livraisons (EF-LIV-01 à 04, D-070), parcours P4 : le gérant attribue, suit
 * et règle les zones ; le livreur voit les siennes, les fait avancer et
 * encaisse à la remise ; le serveur qui les a prises les consulte.
 */
export function DeliveriesScreen() {
  const { ctx } = useRestaurant();
  const data = useDayData();
  const canManage = hasPermission(ctx.role, "delivery.manage");
  const isCourier = ctx.role === "courier";
  const [view, setView] = useState<View>(isCourier ? "mine" : "open");

  if (!data) return null;

  const mine = courierQueue(data.deliveries, ctx.userId);
  const open = data.deliveries.filter(isOpen);
  const done = data.deliveries.filter((delivery) => !isOpen(delivery)).reverse();

  const items = [
    ...(isCourier ? [{ value: "mine" as const, label: "Mes livraisons", count: mine.length }] : []),
    ...(!isCourier ? [{ value: "open" as const, label: "À livrer", count: open.length }] : []),
    { value: "done" as const, label: "Terminées", count: done.length },
    ...(canManage ? [{ value: "zones" as const, label: "Zones" }] : []),
  ];
  const visible =
    view === "mine"
      ? mine
      : view === "open"
        ? open
        : view === "done"
          ? isCourier
            ? done.filter((delivery) => delivery.courierId === ctx.userId)
            : done
          : [];

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <p className="text-sm text-text-muted first-letter:uppercase">
          Journée du {formatLongDate(data.dayStart)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Livraisons</h1>
      </div>

      <Tabs items={items} value={view} onChange={setView} label="Livraisons" />

      {view === "zones" ? (
        <ZonesPanel zones={data.deliveryZones} />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bike}
            title={view === "done" ? "Aucune livraison terminée" : "Aucune livraison en cours"}
            description={
              view === "mine"
                ? "Les livraisons que le gérant vous attribue apparaîtront ici."
                : "Une commande prise en mode « Livraison » apparaît ici."
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((delivery) => (
            <li key={delivery.id}>
              <DeliveryCard data={data} delivery={delivery} canManage={canManage} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryCard({
  data,
  delivery,
  canManage,
}: {
  data: DayData;
  delivery: Delivery;
  canManage: boolean;
}) {
  const { db, ctx } = useRestaurant();
  const [courierId, setCourierId] = useState(delivery.courierId ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const order = data.orders.find((entry) => entry.id === delivery.orderId);
  const invoices = data.invoices.filter(
    (invoice) => invoice.orderId === delivery.orderId && invoice.paymentStatus !== "cancelled",
  );
  const due = remainingDue(
    invoices.map((invoice) => invoice.id),
    data.balances,
    ctx.settings.currency,
  );
  const couriers = data.staff.filter((member) => member.role === "courier");
  const canUpdate =
    hasPermission(ctx.role, "delivery.update") &&
    (ctx.role !== "courier" || delivery.courierId === ctx.userId);
  const canCollect =
    hasPermission(ctx.role, "restaurant.payment.collect") &&
    order !== undefined &&
    canCollectFor({ role: ctx.role, userId: ctx.userId, waiterId: order.waiterId, delivery });
  const next = DELIVERY_TRANSITIONS[delivery.status];

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setFailure(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="article"
      aria-label={`Livraison ${delivery.orderNumber}`}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">{delivery.customerName}</p>
          <p className="text-xs text-text-muted tabular">
            {delivery.orderNumber} · {formatTime(delivery.createdAt)}
            {delivery.desiredTime ? ` · pour ${delivery.desiredTime}` : " · dès que possible"}
          </p>
        </div>
        <Badge tone={STATUS_TONES[delivery.status]}>
          {DELIVERY_STATUS_LABELS[delivery.status]}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <p className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <span>
            {delivery.address} <span className="text-text-muted">· {delivery.zoneName}</span>
          </span>
        </p>
        <a
          href={`tel:${delivery.phone}`}
          className="flex min-h-11 items-center gap-2 self-start rounded-md text-link underline-offset-4 hover:underline"
        >
          <Phone aria-hidden className="size-4" />
          Appeler {delivery.phone}
        </a>
        {order ? (
          <p className="text-text-muted">
            {order.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bg-subtle px-3 py-2 text-sm">
        <span>
          Reste à encaisser : <span className="font-semibold tabular">{formatMoney(due)}</span>
        </span>
        <span className="text-text-muted">
          dont livraison {delivery.fee.amountMinor === 0 ? "gratuite" : formatMoney(delivery.fee)}
        </span>
      </div>

      {canManage && isOpen(delivery) ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Livreur" className="min-w-48 flex-1">
            {({ id }) => (
              <Select
                id={id}
                value={courierId}
                onChange={(event) => setCourierId(event.target.value)}
              >
                <option value="">Choisir…</option>
                {couriers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            variant="outline"
            disabled={busy || courierId === "" || courierId === delivery.courierId}
            onClick={() => void run(() => assignDelivery(db, ctx, delivery.id, courierId))}
          >
            Attribuer
          </Button>
        </div>
      ) : delivery.courierName ? (
        <p className="text-sm text-text-muted">Livreur : {delivery.courierName}</p>
      ) : null}
      {canManage && couriers.length === 0 && isOpen(delivery) ? (
        <p className="text-xs text-text-muted">
          Aucun livreur dans l&apos;équipe : créez un compte « Livreur » dans l&apos;écran Équipe.
        </p>
      ) : null}

      {failure !== null ? (
        <div className="flex flex-col gap-2">
          <Field label="Pourquoi la livraison a-t-elle échoué ?">
            {({ id }) => (
              <Input
                id={id}
                value={failure}
                onChange={(event) => setFailure(event.target.value)}
                placeholder="Client absent, adresse introuvable…"
                maxLength={200}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(() => setDeliveryStatus(db, ctx, delivery.id, "failed", failure))
              }
            >
              Confirmer l&apos;échec
            </Button>
            <Button variant="ghost" onClick={() => setFailure(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canUpdate && next.includes("en-route") ? (
            <Button
              disabled={busy}
              onClick={() => void run(() => setDeliveryStatus(db, ctx, delivery.id, "en-route"))}
            >
              Partir en livraison
            </Button>
          ) : null}
          {canUpdate && next.includes("delivered") ? (
            <Button
              disabled={busy}
              onClick={() => void run(() => setDeliveryStatus(db, ctx, delivery.id, "delivered"))}
            >
              Livrée
            </Button>
          ) : null}
          {canCollect && due.amountMinor > 0 && delivery.status !== "failed" ? (
            <Button variant="outline" onClick={() => setIsPaying(true)}>
              Encaisser
            </Button>
          ) : null}
          {canUpdate && next.includes("failed") ? (
            <Button variant="ghost" disabled={busy} onClick={() => setFailure("")}>
              Échec
            </Button>
          ) : null}
        </div>
      )}

      {/* RG-LIV-01 : le gérant règle une livraison échouée, une seule fois. */}
      {delivery.status === "failed" ? (
        delivery.failureOutcome ? (
          <p className="rounded-md bg-bg-subtle px-3 py-2 text-sm">
            Commande annulée · {DELIVERY_OUTCOME_LABELS[delivery.failureOutcome].toLowerCase()}.
          </p>
        ) : canManage ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <p className="text-sm">
              Les plats rapportés sont-ils réutilisables ? La commande sera annulée, frais compris.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => settleFailedDelivery(db, ctx, delivery.id, "reusable"))
                }
              >
                Réutilisables, remis en stock
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => settleFailedDelivery(db, ctx, delivery.id, "lost"))}
              >
                Perdus, en perte
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Le gérant décidera du sort des plats rapportés.</p>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer text-text-muted">Historique</summary>
        <ol className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3">
          {delivery.events.map((event) => (
            <li key={event.id}>
              <span className="tabular">{formatTime(event.at)}</span> · {EVENT_LABELS[event.kind]}
              {event.byName ? <span className="text-text-muted"> par {event.byName}</span> : null}
              {event.note ? (
                <span className="block text-text-muted">Motif : {event.note}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </details>

      {isPaying ? (
        <PaymentSheet
          open
          onOpenChange={setIsPaying}
          title={`Encaisser ${delivery.customerName}`}
          invoices={invoices}
        />
      ) : null}
    </Card>
  );
}

/** Zones de livraison et leurs frais (EF-LIV-01, D-070 ; gérant). */
function ZonesPanel({ zones }: { zones: DeliveryZone[] }) {
  const [editing, setEditing] = useState<DeliveryZone | "new" | null>(null);
  const active = zones.filter((zone) => zone.archivedAt === null);
  const archived = zones.filter((zone) => zone.archivedAt !== null);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Zones de livraison</h2>
          <p className="mt-1 text-sm text-text-muted">
            Les frais de la zone choisie s&apos;ajoutent à la commande et reviennent au restaurant.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Ajouter une zone
        </Button>
      </div>

      {editing === "new" ? <ZoneForm onDone={() => setEditing(null)} /> : null}

      {active.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={MapPin}
          title="Aucune zone"
          description="Ajoutez les quartiers livrés et leurs frais pour activer la prise de commande en livraison."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {active.map((zone) => (
            <li key={zone.id} className="py-3">
              {editing !== "new" && editing?.id === zone.id ? (
                <ZoneForm zone={zone} onDone={() => setEditing(null)} />
              ) : (
                <ZoneRow zone={zone} onEdit={() => setEditing(zone)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-muted">
            Zones retirées ({archived.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {archived.map((zone) => (
              <li key={zone.id} className="py-3">
                <ZoneRow zone={zone} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function ZoneRow({ zone, onEdit }: { zone: DeliveryZone; onEdit?: () => void }) {
  const { db, ctx } = useRestaurant();
  const [error, setError] = useState<string | null>(null);
  const isArchived = zone.archivedAt !== null;

  async function toggle() {
    setError(null);
    try {
      await setDeliveryZoneArchived(db, ctx, zone.id, !isArchived);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className={cn(isArchived && "text-text-muted")}>
        <p className="font-medium">{zone.name}</p>
        <p className="text-sm text-text-muted tabular">
          {zone.fee.amountMinor === 0 ? "Gratuit" : formatMoney(zone.fee)}
        </p>
      </div>
      <div className="flex gap-1">
        {onEdit ? (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Modifier ${zone.name}`}>
            <Pencil aria-hidden />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void toggle()}
          aria-label={isArchived ? `Remettre ${zone.name} en service` : `Retirer ${zone.name}`}
        >
          {isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ZoneForm({ zone, onDone }: { zone?: DeliveryZone; onDone: () => void }) {
  const { db, ctx } = useRestaurant();
  const [name, setName] = useState(zone?.name ?? "");
  const [fee, setFee] = useState(zone ? String(toMajor(zone.fee)) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await saveDeliveryZone(db, ctx, {
        ...(zone ? { id: zone.id } : {}),
        name,
        feeMajor: fee.trim() === "" ? null : Number(fee),
      });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3 rounded-md bg-bg-subtle p-3"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label="Quartier ou zone">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
            />
          )}
        </Field>
        <Field label={`Frais (${ctx.settings.currency === "CDF" ? "FC" : ctx.settings.currency})`}>
          {({ id }) => (
            <Input
              id={id}
              inputMode="numeric"
              value={fee}
              onChange={(event) => setFee(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
            />
          )}
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {zone ? "Enregistrer" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
