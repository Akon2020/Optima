import type { Tx } from "../db/context";
import { toJson } from "../db/context";

/**
 * Journal d'audit (CLAUDE.md § 5.7, EF-AUD-01, RG-AUD-01) : table en ajout
 * seul, protégée par un trigger. Les secrets sont retirés avant écriture.
 */
export type AuditEntry = {
  establishmentId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  deviceId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  correlationId?: string | null;
};

const SENSITIVE_KEY = /password|pin|token|secret|authorization|cookie|hash/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[masqué]" : redact(inner),
      ]),
    );
  }
  return value;
}

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  // createMany : INSERT sans RETURNING. Les événements sans établissement
  // (connexions) ne sont pas relisibles hors propriétaire (RLS), et
  // l'écriture n'a pas besoin de relire la ligne.
  await tx.auditLog.createMany({
    data: {
      establishmentId: entry.establishmentId,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      deviceId: entry.deviceId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      ...(entry.before === undefined ? {} : { before: toJson(redact(entry.before)) }),
      ...(entry.after === undefined ? {} : { after: toJson(redact(entry.after)) }),
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      correlationId: entry.correlationId ?? null,
    },
  });
}
