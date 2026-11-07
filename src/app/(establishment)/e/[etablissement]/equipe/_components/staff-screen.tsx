"use client";

import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDate, formatRelativeInstant } from "@/shared/lib/dates";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import type { MemberRole } from "@/modules/registry";
import { STAFF_ROLE_LABELS, requiresServicePoint } from "@/server/staff/rules";
import type { StaffMemberSummary, StaffOverview } from "@/server/staff/staff";

import {
  createStaffAction,
  reactivateStaffAction,
  resetStaffPasswordAction,
  signOutStaffAction,
  suspendStaffAction,
  updateStaffAction,
} from "../actions";

const SUSPEND_REASONS = ["Départ", "Fin de contrat", "Absence prolongée"];
const SERVER_UNREACHABLE = "Serveur injoignable. Cette action exige une connexion Internet.";

type Props = { slug: string; nowIso: string; overview: StaffOverview };

function identifierOf(member: StaffMemberSummary): string {
  return member.email ?? member.phone ?? "";
}

function roleLabel(member: StaffMemberSummary): string {
  const label = STAFF_ROLE_LABELS[member.role];
  return member.servicePointName ? `${label} · ${member.servicePointName}` : label;
}

function StatusBadge({ member }: { member: StaffMemberSummary }) {
  if (member.status === "suspended") return <Badge tone="neutral">Suspendu</Badge>;
  if (member.mustChangePassword) return <Badge tone="warning">Mot de passe provisoire</Badge>;
  return <Badge tone="success">Actif</Badge>;
}

/**
 * Écran « Équipe » (EF-CPT-02) : personnel, rôle, poste, dernière connexion ;
 * création, modification, réinitialisation, suspension (EF-CPT-01 à 05).
 */
export function StaffScreen({ slug, nowIso, overview }: Props) {
  const { establishment, viewer, members } = overview;
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = members.find((member) => member.userId === selectedId) ?? null;
  const active = members.filter((member) => member.status === "active");
  const suspended = members.filter((member) => member.status === "suspended");
  const canCreate = overview.assignableRoles.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="active-staff">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="active-staff" className="text-lg font-medium">
            En activité{" "}
            <span className="text-sm font-normal text-text-muted tabular">({active.length})</span>
          </h2>
          {canCreate ? (
            <Button variant="action" onClick={() => setIsCreating(true)}>
              <UserPlus aria-hidden />
              Ajouter un membre
            </Button>
          ) : null}
        </div>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Aucun membre du personnel"
              description="Ajoutez les serveurs, les postes de préparation et les livreurs de l'établissement."
            />
          </Card>
        ) : (
          <MemberList
            members={active}
            viewerId={viewer.userId}
            nowIso={nowIso}
            timeZone={establishment.timeZone}
            onOpen={setSelectedId}
          />
        )}
      </section>

      {suspended.length > 0 ? (
        <section aria-labelledby="suspended-staff">
          <h2 id="suspended-staff" className="mb-3 text-lg font-medium">
            Suspendus{" "}
            <span className="text-sm font-normal text-text-muted tabular">
              ({suspended.length})
            </span>
          </h2>
          <MemberList
            members={suspended}
            viewerId={viewer.userId}
            nowIso={nowIso}
            timeZone={establishment.timeZone}
            onOpen={setSelectedId}
          />
        </section>
      ) : null}

      <CreateSheet
        slug={slug}
        open={isCreating}
        onClose={() => setIsCreating(false)}
        overview={overview}
      />
      <MemberSheet
        slug={slug}
        member={selected}
        overview={overview}
        nowIso={nowIso}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function MemberList({
  members,
  viewerId,
  nowIso,
  timeZone,
  onOpen,
}: {
  members: StaffMemberSummary[];
  viewerId: string;
  nowIso: string;
  timeZone: string;
  onOpen: (userId: string) => void;
}) {
  return (
    <Card className="p-0 sm:p-0">
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-border px-6 py-3 text-xs font-medium text-text-muted lg:grid"
      >
        <span>Nom</span>
        <span>Rôle</span>
        <span>Dernière connexion</span>
        <span>État</span>
        <span className="w-24" />
      </div>
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li
            key={member.userId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:gap-4 lg:px-6"
          >
            <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
              <Avatar name={member.name} />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {member.name}
                  {member.userId === viewerId ? (
                    <span className="ml-2 text-xs font-normal text-text-muted">(vous)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-text-muted">{identifierOf(member)}</p>
              </div>
            </div>
            <div className="col-span-2 lg:hidden">
              <StatusBadge member={member} />
            </div>
            <p className="col-span-2 text-sm lg:col-span-1">
              <span className="sr-only">Rôle : </span>
              {roleLabel(member)}
            </p>
            <p className="col-span-2 text-sm text-text-muted lg:col-span-1">
              <span className="lg:sr-only">Dernière connexion : </span>
              {member.lastLoginAt
                ? formatRelativeInstant(member.lastLoginAt, nowIso, timeZone)
                : "jamais"}
            </p>
            <div className="hidden lg:block">
              <StatusBadge member={member} />
            </div>
            <div className="col-span-2 lg:col-span-1 lg:w-24 lg:text-right">
              {member.canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpen(member.userId)}
                  className="w-full lg:w-auto"
                  aria-label={`Gérer ${member.name}`}
                >
                  Gérer
                </Button>
              ) : member.userId !== viewerId ? (
                <span className="text-xs text-text-muted">Géré par le propriétaire</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Mot de passe provisoire : montré une seule fois, à remettre en main propre. */
function PasswordReveal({ password, identifier }: { password: string; identifier: string }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4" role="status">
      <p className="text-sm">
        Mot de passe provisoire de <span className="font-medium break-all">{identifier}</span> :
      </p>
      <p className="font-mono text-xl font-semibold tracking-wide select-all">{password}</p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(password)
            .then(() => setIsCopied(true))
            .catch(() => setIsCopied(false));
        }}
      >
        {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {isCopied ? "Copié" : "Copier"}
      </Button>
      <p className="text-xs text-text-muted">
        Remettez-le en main propre : il ne sera plus affiché. Il devra être changé à la première
        connexion, sur la page Connexion.
      </p>
    </div>
  );
}

function RoleFields({
  overview,
  role,
  servicePointId,
  onRole,
  onServicePoint,
}: {
  overview: StaffOverview;
  role: MemberRole;
  servicePointId: string;
  onRole: (role: MemberRole) => void;
  onServicePoint: (id: string) => void;
}) {
  return (
    <>
      <Field label="Rôle">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={role}
            onChange={(event) => onRole(event.target.value as MemberRole)}
          >
            {overview.assignableRoles.map((value) => (
              <option key={value} value={value}>
                {STAFF_ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {requiresServicePoint(role) ? (
        <Field label="Poste" hint="Le poste de préparation ne voit que les commandes de ce point.">
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={servicePointId}
              onChange={(event) => onServicePoint(event.target.value)}
              required
            >
              <option value="">Choisir…</option>
              {overview.servicePoints.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
      {children}
    </p>
  );
}

function CreateSheet({
  slug,
  open,
  onClose,
  overview,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  overview: StaffOverview;
}) {
  const router = useRouter();
  const defaultRole = overview.assignableRoles.includes("waiter")
    ? "waiter"
    : (overview.assignableRoles[0] ?? "waiter");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<MemberRole>(defaultRole);
  const [servicePointId, setServicePointId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [created, setCreated] = useState<{ password: string; identifier: string } | null>(null);
  const formId = "create-staff-form";

  function close() {
    setName("");
    setIdentifier("");
    setRole(defaultRole);
    setServicePointId("");
    setError(null);
    setCreated(null);
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const result = await createStaffAction({
        slug,
        name,
        identifier,
        role,
        servicePointId: requiresServicePoint(role) && servicePointId ? servicePointId : null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreated({ password: result.data.temporaryPassword, identifier: identifier.trim() });
      router.refresh();
    } catch {
      setError(SERVER_UNREACHABLE);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={created ? "Compte créé" : "Ajouter un membre"}
      description={
        created
          ? undefined
          : "Le compte reçoit un mot de passe provisoire, à changer à la première connexion."
      }
      footer={
        created ? (
          <Button variant="action" className="w-full sm:w-auto" onClick={close}>
            Terminer
          </Button>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button type="submit" form={formId} variant="action" disabled={isPending}>
              <UserPlus aria-hidden />
              {isPending ? "Création…" : "Créer le compte"}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <PasswordReveal password={created.password} identifier={created.identifier} />
      ) : (
        <form
          id={formId}
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <Field label="Nom affiché" hint="Imprimé sur les factures, par exemple « Amani K. ».">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                autoComplete="off"
                required
              />
            )}
          </Field>
          <Field label="E-mail ou téléphone" hint="Sert d'identifiant de connexion.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                maxLength={120}
                autoComplete="off"
                inputMode="email"
                required
              />
            )}
          </Field>
          <RoleFields
            overview={overview}
            role={role}
            servicePointId={servicePointId}
            onRole={setRole}
            onServicePoint={setServicePointId}
          />
        </form>
      )}
    </Sheet>
  );
}

function MemberSheet({
  slug,
  member,
  overview,
  nowIso,
  onClose,
}: {
  slug: string;
  member: StaffMemberSummary | null;
  overview: StaffOverview;
  nowIso: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={member !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={member ? member.name : "Membre"}
      description={member ? `${roleLabel(member)} · ${identifierOf(member)}` : undefined}
    >
      {member ? (
        // La clé remet les formulaires à zéro d'un membre à l'autre.
        <MemberPanel
          key={member.userId}
          slug={slug}
          member={member}
          overview={overview}
          nowIso={nowIso}
        />
      ) : null}
    </Sheet>
  );
}

function MemberPanel({
  slug,
  member,
  overview,
  nowIso,
}: {
  slug: string;
  member: StaffMemberSummary;
  overview: StaffOverview;
  nowIso: string;
}) {
  const router = useRouter();
  const timeZone = overview.establishment.timeZone;
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<MemberRole>(member.role);
  const [servicePointId, setServicePointId] = useState(member.servicePointId ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  async function run<T>(
    key: string,
    action: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>,
    onSuccess: (data: T) => void,
  ) {
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSuccess(result.data);
      router.refresh();
    } catch {
      setError(SERVER_UNREACHABLE);
    } finally {
      setPending(null);
    }
  }

  const target = { slug, userId: member.userId };
  const isSuspended = member.status === "suspended";

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-text-muted">État</dt>
        <dd>
          <StatusBadge member={member} />
        </dd>
        <dt className="text-text-muted">Dernière connexion</dt>
        <dd>
          {member.lastLoginAt
            ? formatRelativeInstant(member.lastLoginAt, nowIso, timeZone)
            : "jamais"}
        </dd>
        <dt className="text-text-muted">Compte créé</dt>
        <dd>le {formatDate(member.createdAt, timeZone)}</dd>
        {isSuspended ? (
          <>
            <dt className="text-text-muted">Suspension</dt>
            <dd>
              {member.suspendedAt ? `le ${formatDate(member.suspendedAt, timeZone)}` : ""}
              {member.suspendedReason ? ` : ${member.suspendedReason}` : ""}
            </dd>
          </>
        ) : null}
      </dl>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {notice ? (
        <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {isSuspended ? (
        <section aria-labelledby="reactivate-title" className="flex flex-col gap-3">
          <h3 id="reactivate-title" className="font-medium">
            Réactiver l&apos;accès
          </h3>
          <p className="text-sm text-text-muted">
            Le membre pourra de nouveau se connecter avec son mot de passe actuel.
          </p>
          <Button
            variant="action"
            className="self-start"
            disabled={pending !== null}
            onClick={() =>
              void run(
                "reactivate",
                () => reactivateStaffAction(target),
                () => setNotice("Accès réactivé."),
              )
            }
          >
            <UserRoundCheck aria-hidden />
            {pending === "reactivate" ? "Réactivation…" : "Réactiver"}
          </Button>
        </section>
      ) : (
        <>
          <form
            aria-labelledby="edit-title"
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                "update",
                () =>
                  updateStaffAction({
                    ...target,
                    name,
                    role,
                    servicePointId:
                      requiresServicePoint(role) && servicePointId ? servicePointId : null,
                  }),
                () =>
                  setNotice(
                    role !== member.role
                      ? "Modifications enregistrées. Ses sessions ont été fermées : il se reconnecte avec ses nouveaux droits."
                      : "Modifications enregistrées.",
                  ),
              );
            }}
          >
            <h3 id="edit-title" className="font-medium">
              Fiche
            </h3>
            <Field label="Nom affiché">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                />
              )}
            </Field>
            <RoleFields
              overview={overview}
              role={role}
              servicePointId={servicePointId}
              onRole={setRole}
              onServicePoint={setServicePointId}
            />
            <Button
              type="submit"
              variant="primary"
              className="self-start"
              disabled={pending !== null}
            >
              {pending === "update" ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>

          <section
            aria-labelledby="access-title"
            className="flex flex-col gap-3 border-t border-border pt-5"
          >
            <h3 id="access-title" className="font-medium">
              Accès
            </h3>
            {password ? (
              <PasswordReveal password={password} identifier={identifierOf(member)} />
            ) : isConfirmingReset ? (
              <div className="flex flex-col gap-2 rounded-md bg-warning-subtle p-3 text-sm">
                <p>
                  L&apos;ancien mot de passe ne fonctionnera plus et ses sessions seront fermées.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() =>
                      void run(
                        "reset",
                        () => resetStaffPasswordAction(target),
                        (data) => {
                          setIsConfirmingReset(false);
                          setPassword(data.temporaryPassword);
                        },
                      )
                    }
                  >
                    {pending === "reset" ? "Réinitialisation…" : "Confirmer"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsConfirmingReset(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="self-start"
                disabled={pending !== null}
                onClick={() => setIsConfirmingReset(true)}
              >
                <KeyRound aria-hidden />
                Réinitialiser le mot de passe
              </Button>
            )}
            <Button
              variant="outline"
              className="self-start"
              disabled={pending !== null}
              onClick={() =>
                void run(
                  "signout",
                  () => signOutStaffAction(target),
                  (data) =>
                    setNotice(
                      data.sessions === 0
                        ? "Aucune session ouverte."
                        : `${data.sessions} session${data.sessions > 1 ? "s" : ""} fermée${data.sessions > 1 ? "s" : ""}.`,
                    ),
                )
              }
            >
              <LogOut aria-hidden />
              {pending === "signout" ? "Déconnexion…" : "Déconnecter partout"}
            </Button>
          </section>

          <form
            aria-labelledby="suspend-title"
            className="flex flex-col gap-3 border-t border-border pt-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim().length < 3) {
                setError("Indiquez le motif de la suspension.");
                return;
              }
              void run(
                "suspend",
                () => suspendStaffAction({ ...target, reason }),
                () => {
                  setReason("");
                  setNotice("Accès suspendu.");
                },
              );
            }}
          >
            <h3 id="suspend-title" className="font-medium">
              Suspendre l&apos;accès
            </h3>
            <p className="text-sm text-text-muted">
              Effet immédiat : sessions fermées, code PIN refusé sur les appareils dès leur
              prochaine synchronisation. Son nom reste sur les factures déjà émises.
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
                        ? "border-action bg-action text-on-action"
                        : "border-border-strong bg-surface text-text hover:bg-bg-subtle",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Motif" hint="Visible dans le journal d'audit.">
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
            <Button
              type="submit"
              variant="danger"
              className="self-start"
              disabled={pending !== null}
            >
              <UserRoundX aria-hidden />
              {pending === "suspend" ? "Suspension…" : "Suspendre l'accès"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
