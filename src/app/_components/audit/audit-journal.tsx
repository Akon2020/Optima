import { ChevronRight, History, ScrollText } from "lucide-react";
import Link from "next/link";

import { formatDate, formatTime } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/badge";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";

import { AUDIT_DOMAINS, ROLE_LABELS } from "@/server/audit/catalog";
import {
  GLOBAL_SCOPE,
  type AuditEntryView,
  type AuditFilters,
  type AuditOption,
  type AuditPage,
} from "@/server/audit/journal";

/**
 * Fil du journal d'audit (EF-AUD-02) : filtres en formulaire GET (ils
 * marchent sans JavaScript et se partagent par lien), entrées par ordre
 * chronologique inverse, pagination par curseur.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export type AuditQuery = {
  /** Tous les filtres sont présents, à `null` quand ils ne sont pas choisis. */
  filters: { [Key in keyof AuditFilters]-?: string | null };
  before: string | null;
  establishmentId: string | null;
};

const single = (value: string | string[] | undefined) =>
  typeof value === "string" && value !== "" ? value : null;

export function parseAuditQuery(params: SearchParams): AuditQuery {
  return {
    filters: {
      domain: single(params.domaine),
      action: single(params.action),
      actorUserId: single(params.auteur),
      deviceId: single(params.appareil),
      from: single(params.du),
      to: single(params.au),
    },
    before: single(params.avant),
    establishmentId: single(params.etablissement),
  };
}

function queryString(query: AuditQuery, overrides: { before?: string | null } = {}): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    if (value) params.set(key, value);
  };
  set("etablissement", query.establishmentId);
  set("domaine", query.filters.domain);
  set("action", query.filters.action);
  set("auteur", query.filters.actorUserId);
  set("appareil", query.filters.deviceId);
  set("du", query.filters.from);
  set("au", query.filters.to);
  set("avant", "before" in overrides ? overrides.before : query.before);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function SelectFilter({
  name,
  label,
  value,
  options,
  allLabel,
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  options: readonly AuditOption[];
  allLabel: string;
}) {
  const id = `filter-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 pr-8 text-sm text-text focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFilter({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string | null | undefined;
}) {
  const id = `filter-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        name={name}
        defaultValue={value ?? ""}
        className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm text-text focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none"
      />
    </div>
  );
}

function Filters({
  basePath,
  query,
  page,
  showEstablishments,
}: {
  basePath: string;
  query: AuditQuery;
  page: AuditPage;
  showEstablishments: boolean;
}) {
  const hasFilters = Object.values(query.filters).some(Boolean) || Boolean(query.establishmentId);
  return (
    <Card as="section" aria-labelledby="audit-filters-title">
      <h2 id="audit-filters-title" className="sr-only">
        Filtres
      </h2>
      <form method="get" action={basePath} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {showEstablishments ? (
            <SelectFilter
              name="etablissement"
              label="Établissement"
              value={query.establishmentId}
              allLabel="Tous"
              options={[
                ...page.options.establishments,
                { value: GLOBAL_SCOPE, label: "Hors établissement (connexions)" },
              ]}
            />
          ) : null}
          <SelectFilter
            name="domaine"
            label="Domaine"
            value={query.filters.domain}
            allLabel="Tous"
            options={AUDIT_DOMAINS.map((domain) => ({ value: domain.id, label: domain.label }))}
          />
          <SelectFilter
            name="action"
            label="Action"
            value={query.filters.action}
            allLabel="Toutes"
            options={page.options.actions}
          />
          <SelectFilter
            name="auteur"
            label="Auteur"
            value={query.filters.actorUserId}
            allLabel="Tous"
            options={page.options.authors}
          />
          {page.options.devices.length > 0 ? (
            <SelectFilter
              name="appareil"
              label="Appareil"
              value={query.filters.deviceId}
              allLabel="Tous"
              options={page.options.devices}
            />
          ) : null}
          <DateFilter name="du" label="Du" value={query.filters.from} />
          <DateFilter name="au" label="Au" value={query.filters.to} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            Filtrer
          </Button>
          {hasFilters ? (
            <Link href={basePath} className={buttonClasses("ghost")}>
              Effacer les filtres
            </Link>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function Entry({
  entry,
  timeZone,
  showEstablishment,
}: {
  entry: AuditEntryView;
  timeZone: string;
  showEstablishment: boolean;
}) {
  const domain = AUDIT_DOMAINS.find((item) => item.id === entry.domain);
  const hasDetails = entry.changes.length > 0 || entry.ip || entry.entityId;
  const outcome = entry.action.endsWith(".failed")
    ? "Échec"
    : entry.action.endsWith(".refused")
      ? "Refusé"
      : null;
  const roleLabel = entry.actorRole ? (ROLE_LABELS[entry.actorRole] ?? entry.actorRole) : null;
  return (
    <li className="flex flex-col gap-1.5 px-4 py-4 sm:flex-row sm:gap-4 sm:px-6">
      <p className="shrink-0 text-xs text-text-muted tabular sm:w-28 sm:pt-0.5">
        <time dateTime={entry.createdAt}>
          {formatDate(entry.createdAt, timeZone)}
          <span className="sm:block"> {formatTime(entry.createdAt, timeZone)}</span>
        </time>
      </p>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{entry.label}</p>
          {outcome ? <Badge tone="danger">{outcome}</Badge> : null}
          {domain ? (
            <Badge tone="neutral" withDot={false}>
              {domain.label}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-text-muted">
          {entry.actorName ? (
            <>
              par <span className="text-text">{entry.actorName}</span>
              {roleLabel && roleLabel !== entry.actorName ? ` (${roleLabel})` : ""}
            </>
          ) : (
            "auteur inconnu"
          )}
          {entry.deviceCode ? ` · appareil ${entry.deviceCode}` : ""}
          {showEstablishment ? ` · ${entry.establishmentName ?? "hors établissement"}` : ""}
        </p>
        {entry.reason ? (
          <p className="mt-1 text-sm">
            <span className="text-text-muted">Motif : </span>
            {entry.reason}
          </p>
        ) : null}
        {hasDetails ? (
          <details className="group mt-2 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-link sm:min-h-0">
              <ChevronRight
                aria-hidden
                className="size-4 transition-transform group-open:rotate-90"
              />
              Détails
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-md bg-bg-subtle p-3">
              {entry.changes.map((change) => (
                <div key={change.field} className="contents">
                  <dt className="text-text-muted">{change.field}</dt>
                  <dd className="break-words">
                    {change.before !== null ? (
                      <>
                        <span className="line-through decoration-text-muted">{change.before}</span>{" "}
                        →{" "}
                      </>
                    ) : null}
                    {change.after ?? "—"}
                  </dd>
                </div>
              ))}
              {entry.ip ? (
                <>
                  <dt className="text-text-muted">Adresse IP</dt>
                  <dd className="break-all tabular">{entry.ip}</dd>
                </>
              ) : null}
              {entry.entityId ? (
                <>
                  <dt className="text-text-muted">Référence</dt>
                  <dd className="break-all font-mono text-xs">{entry.entityId}</dd>
                </>
              ) : null}
            </dl>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function AuditJournal({
  basePath,
  query,
  page,
  showEstablishments,
}: {
  basePath: string;
  query: AuditQuery;
  page: AuditPage;
  showEstablishments: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Filters
        basePath={basePath}
        query={query}
        page={page}
        showEstablishments={showEstablishments}
      />
      {page.entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="Aucune entrée"
            description={
              Object.values(query.filters).some(Boolean)
                ? "Aucune action ne correspond à ces filtres."
                : "Les actions sensibles apparaîtront ici dès qu'elles auront lieu."
            }
          />
        </Card>
      ) : (
        <Card className="p-0 sm:p-0">
          <ol className="divide-y divide-border" aria-label="Entrées du journal">
            {page.entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                timeZone={page.timeZone}
                showEstablishment={showEstablishments}
              />
            ))}
          </ol>
        </Card>
      )}
      <nav aria-label="Pages du journal" className="flex flex-wrap gap-2">
        {query.before ? (
          <Link
            href={`${basePath}${queryString(query, { before: null })}`}
            className={buttonClasses("ghost")}
          >
            <History aria-hidden />
            Les plus récentes
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link
            href={`${basePath}${queryString(query, { before: page.nextCursor })}`}
            className={buttonClasses("outline")}
          >
            Entrées plus anciennes
            <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
