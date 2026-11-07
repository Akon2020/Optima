"use client";

import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDate } from "@/shared/lib/dates";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { Field, Input, Textarea } from "@/shared/ui/field";

import type { EstablishmentDetail, ModuleState } from "@/server/owner/establishments";

import {
  reactivateEstablishmentAction,
  setModuleAction,
  suspendEstablishmentAction,
  updateIdentityAction,
} from "../../actions";
import { HeaderPreview } from "../../_components/header-preview";

const SERVER_UNREACHABLE = "Serveur injoignable. Cette action exige une connexion Internet.";
const SUSPEND_REASONS = ["Fermeture temporaire", "Travaux", "Contrôle en cours"];

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm">
        {notice}
      </p>
    );
  }
  return null;
}

/** Identité et aperçu de l'en-tête imprimé (EF-ETB-01, EF-ETB-02). */
export function IdentityPanel({ establishment }: { establishment: EstablishmentDetail }) {
  const router = useRouter();
  const [name, setName] = useState(establishment.name);
  const [legalName, setLegalName] = useState(establishment.legalName ?? "");
  const [address, setAddress] = useState(establishment.address ?? "");
  const [phone, setPhone] = useState(establishment.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateIdentityAction({
        establishmentId: establishment.id,
        name,
        legalName,
        address,
        phone,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice("Identité enregistrée.");
      router.refresh();
    } catch {
      setError(SERVER_UNREACHABLE);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card aria-labelledby="identity-title">
      <CardHeader title="Identité" titleId="identity-title" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
          <Feedback error={error} notice={notice} />
          <Field label="Nom de l'établissement">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            )}
          </Field>
          <Field label="Raison sociale" optional>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                maxLength={120}
              />
            )}
          </Field>
          <Field label="Adresse" optional>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={200}
              />
            )}
          </Field>
          <Field label="Téléphone" optional>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={30}
                inputMode="tel"
              />
            )}
          </Field>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-muted">Devise de base</dt>
            <dd>{establishment.currency} (figée, RG-ETB-01)</dd>
            <dt className="text-text-muted">Adresse OPTIMA</dt>
            <dd className="break-all">/e/{establishment.slug}</dd>
            <dt className="text-text-muted">Créé le</dt>
            <dd>{formatDate(establishment.createdAt, establishment.timeZone)}</dd>
          </dl>
          <Button type="submit" variant="primary" className="self-start" disabled={isPending}>
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
        <HeaderPreview
          identity={{
            name,
            legalName: legalName.trim() || null,
            address: address.trim() || null,
            phone: phone.trim() || null,
          }}
        />
      </div>
    </Card>
  );
}

/** Modules activables (EF-MOD-01, RG-MOD-01, RG-MOD-02). */
export function ModulesPanel({ establishment }: { establishment: EstablishmentDetail }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle(module: ModuleState) {
    setPending(module.id);
    setError(null);
    setNotice(null);
    try {
      const result = await setModuleAction({
        establishmentId: establishment.id,
        module: module.id,
        enabled: !module.enabled,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(`${module.name} ${module.enabled ? "désactivé" : "activé"}.`);
      router.refresh();
    } catch {
      setError(SERVER_UNREACHABLE);
    } finally {
      setPending(null);
    }
  }

  return (
    <Card aria-labelledby="modules-title">
      <CardHeader
        title="Modules"
        titleId="modules-title"
        description="Désactiver un module masque ses écrans sans effacer ses données ; elles reviennent à la réactivation."
      />
      <div className="flex flex-col gap-3">
        <Feedback error={error} notice={notice} />
        <ul className="divide-y divide-border">
          {establishment.modules.map((module) => {
            const reason = module.enabled
              ? module.blockedBy.length > 0
                ? `Utilisé par : ${module.blockedBy.join(", ")}.`
                : null
              : module.missing.length > 0
                ? `Exige d'abord : ${module.missing.join(", ")}.`
                : null;
            const isLocked = reason !== null;
            const labelId = `module-${module.id}`;
            return (
              <li key={module.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p id={labelId} className="text-sm font-medium">
                    {module.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {module.enabled ? "Actif" : "Inactif"}
                    {reason ? ` · ${reason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={module.enabled}
                  aria-labelledby={labelId}
                  disabled={isLocked || pending !== null}
                  onClick={() => void toggle(module)}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    "before:absolute before:-inset-2 before:content-['']",
                    module.enabled
                      ? "border-primary bg-primary"
                      : "border-border-strong bg-bg-subtle",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-5 rounded-full bg-surface shadow-sm transition-transform duration-150",
                      module.enabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-muted">
          Les appareils de l&apos;établissement voient leurs opérations d&apos;un module désactivé
          refusées, avec un motif.
        </p>
      </div>
    </Card>
  );
}

/** Suspension et réactivation (EF-ETB-03). */
export function StatusPanel({ establishment }: { establishment: EstablishmentDetail }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuspended = establishment.status === "suspended";

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "Action impossible.");
        return;
      }
      setReason("");
      router.refresh();
    } catch {
      setError(SERVER_UNREACHABLE);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card aria-labelledby="status-title">
      <CardHeader
        title={isSuspended ? "Établissement suspendu" : "Suspendre l'établissement"}
        titleId="status-title"
      />
      <div className="flex flex-col gap-4">
        <Feedback error={error} notice={null} />
        {isSuspended ? (
          <>
            <p className="text-sm">
              Suspendu
              {establishment.suspendedAt
                ? ` le ${formatDate(establishment.suspendedAt, establishment.timeZone)}`
                : ""}
              {establishment.suspendedReason ? ` : ${establishment.suspendedReason}` : ""}. Personne
              n&apos;y travaille ; les appareils gardent leurs données et leurs opérations en
              attente.
            </p>
            <Button
              variant="primary"
              className="self-start"
              disabled={pending}
              onClick={() =>
                void run(() => reactivateEstablishmentAction({ establishmentId: establishment.id }))
              }
            >
              <Play aria-hidden />
              {pending ? "Réactivation…" : "Réactiver"}
            </Button>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim().length < 3) {
                setError("Indiquez le motif de la suspension.");
                return;
              }
              void run(() =>
                suspendEstablishmentAction({ establishmentId: establishment.id, reason }),
              );
            }}
          >
            <p className="text-sm text-text-muted">
              Plus personne ne pourra y travailler ni synchroniser. Les données sont conservées et
              la réactivation rend l&apos;accès à l&apos;identique.
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium">Motifs fréquents</legend>
              <div className="flex flex-wrap gap-2">
                {SUSPEND_REASONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReason(label)}
                    aria-pressed={reason === label}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                      reason === label
                        ? "border-primary bg-primary text-on-primary"
                        : "border-border-strong bg-surface text-text hover:bg-bg-subtle",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Motif" hint="Visible dans le journal d'audit de l'établissement.">
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            <Button type="submit" variant="danger" className="self-start" disabled={pending}>
              <Pause aria-hidden />
              {pending ? "Suspension…" : "Suspendre l'établissement"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
