import type { Prisma } from "@/generated/prisma/client";

import { toCsv } from "@/shared/lib/csv";
import { DEFAULT_TIME_ZONE, formatDate, formatTime, zonedDayStart } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";

import { authorize, requireOwner, type Actor } from "../authz/authorize";
import type { Db } from "../db/context";
import { withContext } from "../db/context";
import { renderPdf } from "../exports/pdf";
import { buildTableDocument } from "../exports/table-document";
import { buildWorkbook } from "../exports/xlsx";
import { writeAudit } from "./audit";
import {
  AUDIT_DOMAINS,
  ROLE_LABELS,
  actionLabel,
  describeChanges,
  domainOf,
  domainPrefixes,
  isAuditDomain,
  reasonLabel,
  type AuditChange,
  type AuditDomain,
} from "./catalog";

/**
 * Consultation du journal d'audit (EF-AUD-02 à 04) : fil chronologique
 * filtrable par domaine, action, auteur, appareil et dates. Le gérant voit
 * son établissement (permission `core.audit.read`), le propriétaire tous
 * (EF-AUD-03). Le journal lui-même reste en ajout seul (RG-AUD-01).
 */

export const AUDIT_PAGE_SIZE = 50;
/** Au-delà, l'export demande de resserrer les filtres. */
export const AUDIT_EXPORT_MAX = 10_000;
/** Filtre propriétaire : événements sans établissement (connexions, sécurité). */
export const GLOBAL_SCOPE = "global";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;

export type AuditScope =
  | { kind: "establishment"; establishmentId: string }
  | { kind: "owner"; establishmentId: string | null };

export type AuditFilters = {
  domain?: string | null;
  action?: string | null;
  actorUserId?: string | null;
  deviceId?: string | null;
  /** Dates locales AAAA-MM-JJ, bornes incluses. */
  from?: string | null;
  to?: string | null;
};

export type AuditEntryView = {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  domain: AuditDomain | null;
  actorName: string | null;
  actorRole: string | null;
  deviceCode: string | null;
  establishmentName: string | null;
  entity: string;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
  changes: AuditChange[];
};

export type AuditOption = { value: string; label: string };

export type AuditPage = {
  entries: AuditEntryView[];
  /** Curseur des entrées plus anciennes, ou `null` en fin de journal. */
  nextCursor: string | null;
  timeZone: string;
  options: {
    actions: AuditOption[];
    authors: AuditOption[];
    devices: AuditOption[];
    establishments: AuditOption[];
  };
};

type Access = {
  dbContext: { establishmentId: string | null; isOwner: boolean };
  /** Condition d'établissement : un identifiant, `null` (événements globaux) ou tous. */
  establishmentFilter: string | null | undefined;
  timeZone: string;
  role: string;
};

async function resolveAccess(db: Db, actor: Actor | null, scope: AuditScope): Promise<Access> {
  if (scope.kind === "establishment") {
    const access = await authorize(db, actor, "core.audit.read", {
      establishmentId: scope.establishmentId,
    });
    const establishment = await db.establishment.findUniqueOrThrow({
      where: { id: access.establishmentId },
      select: { timeZone: true },
    });
    return {
      dbContext: access.dbContext,
      establishmentFilter: access.establishmentId,
      timeZone: establishment.timeZone,
      role: access.role,
    };
  }
  requireOwner(actor);
  let establishmentFilter: string | null | undefined;
  let timeZone = DEFAULT_TIME_ZONE;
  if (scope.establishmentId === GLOBAL_SCOPE) {
    establishmentFilter = null;
  } else if (scope.establishmentId && UUID.test(scope.establishmentId)) {
    const establishment = await db.establishment.findUnique({
      where: { id: scope.establishmentId },
      select: { id: true, timeZone: true },
    });
    if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
    establishmentFilter = establishment.id;
    timeZone = establishment.timeZone;
  }
  return {
    dbContext: { establishmentId: null, isOwner: true },
    establishmentFilter,
    timeZone,
    role: "owner",
  };
}

function nextDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) + DAY_MS).toISOString().slice(0, 10);
}

/** Conditions de la requête, à partir de filtres déjà nettoyés (aucune valeur brute). */
function buildWhere(access: Access, filters: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (access.establishmentFilter !== undefined) {
    and.push({ establishmentId: access.establishmentFilter });
  }
  if (filters.domain && isAuditDomain(filters.domain)) {
    and.push({
      OR: domainPrefixes(filters.domain).map((prefix) => ({ action: { startsWith: prefix } })),
    });
  }
  if (filters.action && /^[a-z0-9.-]{1,80}$/.test(filters.action)) {
    and.push({ action: filters.action });
  }
  if (filters.actorUserId && UUID.test(filters.actorUserId)) {
    and.push({ actorUserId: filters.actorUserId });
  }
  if (filters.deviceId && UUID.test(filters.deviceId)) {
    and.push({ deviceId: filters.deviceId });
  }
  const from = filters.from ? zonedDayStart(filters.from, access.timeZone) : null;
  if (from) and.push({ createdAt: { gte: new Date(from) } });
  const to =
    filters.to && zonedDayStart(filters.to, access.timeZone)
      ? zonedDayStart(nextDayKey(filters.to), access.timeZone)
      : null;
  if (to) and.push({ createdAt: { lt: new Date(to) } });
  return { AND: and };
}

type Row = Awaited<ReturnType<Db["auditLog"]["findMany"]>>[number];

async function enrich(db: Db, rows: Row[]): Promise<AuditEntryView[]> {
  const ids = (values: (string | null)[]) => [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
  const [users, devices, establishments] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids(rows.map((row) => row.actorUserId)) } },
      select: { id: true, displayName: true },
    }),
    db.device.findMany({
      where: { id: { in: ids(rows.map((row) => row.deviceId)) } },
      select: { id: true, code: true },
    }),
    db.establishment.findMany({
      where: { id: { in: ids(rows.map((row) => row.establishmentId)) } },
      select: { id: true, name: true },
    }),
  ]);
  const userName = new Map(users.map((user) => [user.id, user.displayName]));
  const deviceCode = new Map(devices.map((device) => [device.id, device.code]));
  const establishmentName = new Map(establishments.map((entry) => [entry.id, entry.name]));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    label: actionLabel(row.action),
    domain: domainOf(row.action),
    actorName: row.actorUserId ? (userName.get(row.actorUserId) ?? null) : null,
    actorRole: row.actorRole,
    deviceCode: row.deviceId ? (deviceCode.get(row.deviceId) ?? null) : null,
    establishmentName: row.establishmentId
      ? (establishmentName.get(row.establishmentId) ?? null)
      : null,
    entity: row.entity,
    entityId: row.entityId,
    reason: reasonLabel(row.reason),
    ip: row.ip,
    changes: describeChanges(row.before, row.after),
  }));
}

async function options(db: Db, access: Access): Promise<AuditPage["options"]> {
  const scoped =
    access.establishmentFilter === undefined ? {} : { establishmentId: access.establishmentFilter };
  const { actions, authors } = await withContext(db, access.dbContext, async (tx) => ({
    actions: await tx.auditLog.groupBy({ by: ["action"], where: scoped }),
    authors: await tx.auditLog.groupBy({
      by: ["actorUserId"],
      where: { ...scoped, actorUserId: { not: null } },
    }),
  }));
  const [users, devices, establishments] = await Promise.all([
    db.user.findMany({
      where: {
        id: {
          in: authors
            .map((row) => row.actorUserId)
            .filter((value): value is string => value !== null),
        },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    access.establishmentFilter === null
      ? Promise.resolve([])
      : db.device.findMany({
          where: access.establishmentFilter ? { establishmentId: access.establishmentFilter } : {},
          select: { id: true, code: true, name: true },
          orderBy: { registeredAt: "asc" },
        }),
    access.role === "owner"
      ? db.establishment.findMany({
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return {
    actions: actions
      .map((row) => ({ value: row.action, label: actionLabel(row.action) }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    authors: users.map((user) => ({ value: user.id, label: user.displayName })),
    devices: devices.map((device) => ({
      value: device.id,
      label: `${device.code} · ${device.name}`,
    })),
    establishments: establishments.map((entry) => ({ value: entry.id, label: entry.name })),
  };
}

export async function listAuditEntries(
  db: Db,
  actor: Actor | null,
  input: { scope: AuditScope; filters: AuditFilters; before?: string | null; limit?: number },
): Promise<AuditPage> {
  const access = await resolveAccess(db, actor, input.scope);
  const limit = Math.min(Math.max(input.limit ?? AUDIT_PAGE_SIZE, 1), 200);
  const where = buildWhere(access, input.filters);
  if (input.before && UUID.test(input.before)) {
    (where.AND as Prisma.AuditLogWhereInput[]).push({ id: { lt: input.before } });
  }
  // Identifiants UUIDv7 : l'ordre des identifiants est l'ordre chronologique.
  const rows = await withContext(db, access.dbContext, (tx) =>
    tx.auditLog.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 }),
  );
  const page = rows.slice(0, limit);
  return {
    entries: await enrich(db, page),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    timeZone: access.timeZone,
    options: await options(db, access),
  };
}

export const AUDIT_EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number];

/** Un PDF de plus de 2 000 lignes devient illisible et lent à produire. */
export const AUDIT_PDF_MAX = 2_000;

const MIME_TYPES: Record<AuditExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export type AuditExportFile = {
  filename: string;
  mimeType: string;
  /** Contenu du fichier en base64 (les Server Actions ne transportent que du texte). */
  base64: string;
  count: number;
};

/** Lignes d'en-tête du document : périmètre et filtres appliqués. */
async function describeExport(db: Db, access: Access, filters: AuditFilters): Promise<string[]> {
  let scope = "Tous les établissements, et les événements hors établissement";
  if (access.establishmentFilter === null) scope = "Hors établissement (connexions et sécurité)";
  else if (access.establishmentFilter) {
    const establishment = await db.establishment.findUnique({
      where: { id: access.establishmentFilter },
      select: { name: true },
    });
    scope = `Établissement : ${establishment?.name ?? "inconnu"}`;
  }
  const parts: string[] = [];
  if (filters.from || filters.to) {
    parts.push(`période ${filters.from ?? "…"} → ${filters.to ?? "…"}`);
  }
  if (filters.domain && isAuditDomain(filters.domain)) {
    const label = AUDIT_DOMAINS.find((domain) => domain.id === filters.domain)?.label;
    parts.push(`domaine « ${label} »`);
  }
  if (filters.action) parts.push(`action « ${actionLabel(filters.action)} »`);
  if (filters.actorUserId && UUID.test(filters.actorUserId)) {
    const user = await db.user.findUnique({
      where: { id: filters.actorUserId },
      select: { displayName: true },
    });
    parts.push(`auteur ${user?.displayName ?? "inconnu"}`);
  }
  if (filters.deviceId && UUID.test(filters.deviceId)) {
    const device = await db.device.findUnique({
      where: { id: filters.deviceId },
      select: { code: true },
    });
    parts.push(`appareil ${device?.code ?? "inconnu"}`);
  }
  return [scope, parts.length > 0 ? `Filtres : ${parts.join(", ")}.` : "Aucun filtre."];
}

/**
 * Export du journal (EF-AUD-04) en CSV, Excel ou PDF. L'export est lui-même
 * inscrit au journal, avec son format : dans l'établissement concerné
 * (visible du gérant, RG-PRO-01) ou, pour tous les établissements, au
 * journal global.
 */
export async function exportAudit(
  db: Db,
  actor: Actor | null,
  input: { scope: AuditScope; filters: AuditFilters; format: AuditExportFormat },
  meta: { ip?: string | null; now?: Date } = {},
): Promise<AuditExportFile> {
  if (!AUDIT_EXPORT_FORMATS.includes(input.format)) {
    throw new DomainError("INVALID_INPUT", "Format d'export inconnu.");
  }
  const access = await resolveAccess(db, actor, input.scope);
  const where = buildWhere(access, input.filters);
  const max = input.format === "pdf" ? AUDIT_PDF_MAX : AUDIT_EXPORT_MAX;
  const rows = await withContext(db, access.dbContext, (tx) =>
    tx.auditLog.findMany({ where, orderBy: { id: "desc" }, take: max + 1 }),
  );
  if (rows.length > max) {
    throw new DomainError(
      "EXPORT_TOO_LARGE",
      input.format === "pdf"
        ? `Plus de ${max.toLocaleString("fr-FR")} entrées pour un PDF : resserrez les filtres, ou choisissez Excel.`
        : `Plus de ${max.toLocaleString("fr-FR")} entrées : resserrez les dates ou les filtres.`,
    );
  }
  const entries = await enrich(db, rows);
  const withEstablishment = access.establishmentFilter === undefined;
  const header = [
    "Date",
    "Heure",
    ...(withEstablishment ? ["Établissement"] : []),
    "Action",
    "Auteur",
    "Rôle",
    "Appareil",
    "Motif",
    "Détails",
    "Adresse IP",
    "Code de l'action",
  ];
  const weights = [1.5, 0.8, ...(withEstablishment ? [1.6] : []), 2, 1.3, 1, 0.8, 1.6, 2.8, 1, 1.8];
  const body = entries.map((entry) => [
    formatDate(entry.createdAt, access.timeZone),
    formatTime(entry.createdAt, access.timeZone),
    ...(withEstablishment ? [entry.establishmentName ?? "Hors établissement"] : []),
    entry.label,
    entry.actorName,
    entry.actorRole ? (ROLE_LABELS[entry.actorRole] ?? entry.actorRole) : null,
    entry.deviceCode,
    entry.reason,
    entry.changes
      .map((change) => `${change.field} : ${change.before ?? "—"} → ${change.after ?? "—"}`)
      .join(" | "),
    entry.ip,
    entry.action,
  ]);

  const now = meta.now ?? new Date();
  const nowIso = now.toISOString();
  const table = {
    title: "Journal d'audit",
    details: await describeExport(db, access, input.filters),
    header,
    rows: body,
    generatedAt: `${formatDate(nowIso, access.timeZone)} à ${formatTime(nowIso, access.timeZone)}`,
    columnWeights: weights,
  };
  let content: Buffer;
  if (input.format === "csv") {
    content = Buffer.from(toCsv(header, body), "utf8");
  } else if (input.format === "xlsx") {
    content = await buildWorkbook({ ...table, sheetName: "Journal" });
  } else {
    content = await renderPdf(buildTableDocument(table), {
      landscape: true,
      footerLabel: `OPTIMA · Journal d'audit · ${table.details[0] ?? ""}`,
    });
  }

  const target = access.establishmentFilter ?? null;
  await withContext(db, { establishmentId: target, isOwner: access.role === "owner" }, (tx) =>
    writeAudit(tx, {
      establishmentId: target,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: access.role === "owner" && !target ? "owner.audit.exported" : "core.audit.exported",
      entity: "audit_log",
      after: { format: input.format, count: entries.length, filters: input.filters },
      ip: meta.ip ?? null,
    }),
  );

  return {
    filename: `journal-audit-${nowIso.slice(0, 10)}.${input.format}`,
    mimeType: MIME_TYPES[input.format],
    base64: content.toString("base64"),
    count: entries.length,
  };
}
