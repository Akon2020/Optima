"use client";

import { Ban, CloudOff, Plus, Smartphone, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDate, formatRelativeInstant, formatTime } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import type { DeviceSummary } from "@/server/sync/devices";

import { revokeDeviceAction } from "../actions";

/** EF-PRO-05 : un appareil sans nouvelles depuis 24 heures est signalé. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const REASONS = ["Appareil perdu", "Appareil volé", "Appareil remplacé", "Ne sert plus"];

type Props = {
  slug: string;
  timeZone: string;
  nowIso: string;
  devices: DeviceSummary[];
  pairingPath: string | null;
};

function isStale(device: DeviceSummary, nowIso: string): boolean {
  const reference = device.lastSyncAt ?? device.registeredAt;
  return new Date(nowIso).getTime() - new Date(reference).getTime() > STALE_AFTER_MS;
}

/**
 * Écran « Appareils » (EF-CPT-04) : appareils appairés, dernière
 * synchronisation, refus à revoir, révocation avec motif.
 */
export function DevicesScreen({ slug, timeZone, nowIso, devices, pairingPath }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<DeviceSummary | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const active = devices.filter((device) => !device.revokedAt);
  const revoked = devices.filter((device) => device.revokedAt);

  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only" role="status" aria-live="polite">
        {done ?? ""}
      </p>
      {done ? (
        <p className="rounded-md bg-success-subtle px-4 py-3 text-sm" aria-hidden>
          {done}
        </p>
      ) : null}

      <section aria-labelledby="active-devices">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="active-devices" className="text-lg font-medium">
            En service
          </h2>
          <span className="text-sm text-text-muted tabular">
            {active.length} appareil{active.length > 1 ? "s" : ""}
          </span>
        </div>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={Smartphone}
              title="Aucun appareil en service"
              description="Appairez le premier téléphone ou la première tablette du restaurant."
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((device) => (
              <li key={device.id}>
                <DeviceCard
                  device={device}
                  nowIso={nowIso}
                  timeZone={timeZone}
                  onRevoke={() => {
                    setDone(null);
                    setTarget(device);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card as="section" aria-labelledby="add-device">
        <div className="flex gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-card bg-primary-subtle text-text"
          >
            <Plus className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="add-device" className="font-medium">
              Ajouter un appareil
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Sur le nouvel appareil, connectez-vous en gérant, ouvrez{" "}
              {pairingPath ? "cette adresse" : "l'espace de l'établissement"} et donnez-lui un nom.
            </p>
            {pairingPath ? (
              <p className="mt-2 w-fit max-w-full truncate rounded-md bg-bg-subtle px-2.5 py-1 font-mono text-sm text-text">
                {pairingPath}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-text-muted">
              Votre session se ferme ensuite sur cet appareil : chacun s&apos;y ajoute avec son mot
              de passe, puis choisit son code PIN.
            </p>
          </div>
        </div>
      </Card>

      {revoked.length > 0 ? (
        <section aria-labelledby="revoked-devices">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="revoked-devices" className="text-lg font-medium">
              Révoqués
            </h2>
            <span className="text-sm text-text-muted tabular">{revoked.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {revoked.map((device) => (
              <li key={device.id}>
                <DeviceCard device={device} nowIso={nowIso} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RevokeSheet
        slug={slug}
        device={target}
        nowIso={nowIso}
        timeZone={timeZone}
        onClose={() => setTarget(null)}
        onRevoked={(device) => {
          setTarget(null);
          setDone(`${device.code} · ${device.name} est révoqué.`);
          router.refresh();
        }}
      />
    </div>
  );
}

function DeviceCard({
  device,
  nowIso,
  timeZone,
  onRevoke,
}: {
  device: DeviceSummary;
  nowIso: string;
  timeZone: string;
  onRevoke?: () => void;
}) {
  const isRevoked = Boolean(device.revokedAt);
  const stale = !isRevoked && isStale(device, nowIso);

  return (
    <Card as="article" className={cn("flex h-full flex-col gap-4", isRevoked && "opacity-80")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-card bg-bg-subtle text-sm font-semibold tabular"
          >
            {device.code}
          </span>
          <h3 className="min-w-0 truncate font-medium">
            <span className="sr-only">{device.code} : </span>
            {device.name}
          </h3>
        </div>
        {isRevoked ? (
          <Badge tone="neutral">Révoqué</Badge>
        ) : stale ? (
          <Badge tone="warning">Sans nouvelles</Badge>
        ) : (
          <Badge tone="success">Actif</Badge>
        )}
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-text-muted">Dernière synchronisation</dt>
          <dd className={cn("font-medium", stale && "text-text")}>
            {device.lastSyncAt
              ? formatRelativeInstant(device.lastSyncAt, nowIso, timeZone)
              : "jamais"}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-text-muted">Appairé</dt>
          <dd>
            {formatDate(device.registeredAt, timeZone)}
            {device.registeredByName ? ` par ${device.registeredByName}` : ""}
          </dd>
        </div>
        {device.rejectedOperations > 0 ? (
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-text-muted">Opérations refusées</dt>
            <dd className="font-medium tabular">{device.rejectedOperations}</dd>
          </div>
        ) : null}
      </dl>

      {stale ? (
        <p className="flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm">
          <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          Aucune synchronisation depuis plus de 24 heures. Vérifiez que l&apos;appareil est allumé
          et connecté.
        </p>
      ) : null}

      {isRevoked && device.revokedAt ? (
        <p className="rounded-md bg-bg-subtle px-3 py-2 text-sm">
          Révoqué le {formatDate(device.revokedAt, timeZone)} à{" "}
          {formatTime(device.revokedAt, timeZone)}
          {device.revokedByName ? ` par ${device.revokedByName}` : ""}
          {device.revokedReason ? ` : ${device.revokedReason}` : ""}.
        </p>
      ) : null}

      {onRevoke ? (
        <div className="mt-auto">
          <Button variant="danger" onClick={onRevoke} className="w-full sm:w-auto">
            <Ban aria-hidden />
            Révoquer
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function RevokeSheet({
  slug,
  device,
  nowIso,
  timeZone,
  onClose,
  onRevoked,
}: {
  slug: string;
  device: DeviceSummary | null;
  nowIso: string;
  timeZone: string;
  onClose: () => void;
  onRevoked: (device: DeviceSummary) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const formId = "revoke-device-form";

  function close() {
    setReason("");
    setError(null);
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!device) return;
    if (reason.trim().length < 3) {
      setError("Indiquez le motif de la révocation.");
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      const result = await revokeDeviceAction({ slug, deviceId: device.id, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReason("");
      onRevoked(device);
    } catch {
      setError("Serveur injoignable. La révocation exige une connexion Internet.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Sheet
      open={device !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={device ? `Révoquer ${device.code} · ${device.name}` : "Révoquer"}
      description="L'appareil ne pourra plus envoyer ni recevoir de données. Il effacera ses données locales à sa prochaine connexion."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button type="submit" form={formId} variant="danger" disabled={isPending}>
            <Ban aria-hidden />
            {isPending ? "Révocation…" : "Révoquer l'appareil"}
          </Button>
        </div>
      }
    >
      {device ? (
        <form
          id={formId}
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          <p className="flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {device.lastSyncAt
                ? `Dernière synchronisation ${formatRelativeInstant(device.lastSyncAt, nowIso, timeZone)}. `
                : "Cet appareil ne s'est jamais synchronisé. "}
              Ce qui y a été saisi depuis, et pas encore envoyé, ne pourra plus arriver au serveur.
            </span>
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium">Motifs fréquents</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setReason(label)}
                  aria-pressed={reason === label}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                    reason === label
                      ? "border-action bg-action text-on-action"
                      : "border-border-strong bg-surface text-text hover:bg-bg-subtle",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Motif" error={error ?? undefined} hint="Visible dans le journal d'audit.">
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
                required
                aria-invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        </form>
      ) : null}
    </Sheet>
  );
}
