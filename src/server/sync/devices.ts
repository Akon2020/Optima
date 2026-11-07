import { DomainError } from "@/shared/lib/errors";

import { writeAudit } from "../audit/audit";
import { authorize, type Actor } from "../authz/authorize";
import { randomToken, safeEqualHex, sha256 } from "../auth/crypto";
import type { Db } from "../db/context";
import { withContext } from "../db/context";

/**
 * Appareils enregistrés (CLAUDE.md § 5.2, EF-CPT-04, RG-OFF-02). Chaque
 * appareil reçoit un code (D01, D02...) pour la numérotation et un secret,
 * montré une seule fois et stocké haché. La révocation est immédiate.
 */
export type AuthenticatedDevice = {
  id: string;
  code: string;
  establishmentId: string;
  currency: string;
};

export async function registerDevice(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; name: string },
  meta: { ip?: string | null } = {},
): Promise<{ deviceId: string; code: string; token: string }> {
  const access = await authorize(db, actor, "core.device.register", {
    establishmentId: input.establishmentId,
  });
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) throw new DomainError("INVALID_NAME", "Donnez un nom à l'appareil.");

  const existing = await db.device.count({ where: { establishmentId: access.establishmentId } });
  const code = `D${String(existing + 1).padStart(2, "0")}`;
  const secret = randomToken();
  const device = await db.device.create({
    data: {
      establishmentId: access.establishmentId,
      code,
      name,
      secretHash: sha256(secret),
      registeredBy: actor?.userId ?? "",
    },
  });
  await withContext(db, access.dbContext, (tx) =>
    writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      deviceId: device.id,
      action: "core.device.registered",
      entity: "device",
      entityId: device.id,
      after: { code, name },
      ip: meta.ip ?? null,
    }),
  );
  return { deviceId: device.id, code, token: `${device.id}.${secret}` };
}

export async function revokeDevice(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; deviceId: string; reason: string },
  meta: { ip?: string | null } = {},
): Promise<void> {
  const access = await authorize(db, actor, "core.device.revoke", {
    establishmentId: input.establishmentId,
  });
  if (input.reason.trim().length < 3) {
    throw new DomainError("REASON_REQUIRED", "Indiquez le motif de la révocation.");
  }
  if (input.reason.trim().length > 200) {
    throw new DomainError("REASON_TOO_LONG", "Le motif tient en 200 caractères au plus.");
  }
  const result = await db.device.updateMany({
    where: { id: input.deviceId, establishmentId: access.establishmentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0)
    throw new DomainError("NOT_FOUND", "Appareil introuvable ou déjà révoqué.");
  await withContext(db, access.dbContext, (tx) =>
    writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      deviceId: input.deviceId,
      action: "core.device.revoked",
      entity: "device",
      entityId: input.deviceId,
      reason: input.reason.trim(),
      ip: meta.ip ?? null,
    }),
  );
}

/** Un appareil tel que le gérant le voit sur l'écran « Appareils ». */
export type DeviceSummary = {
  id: string;
  code: string;
  name: string;
  registeredAt: string;
  registeredByName: string;
  lastSyncAt: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  revokedReason: string | null;
  /** Opérations refusées par le serveur (EF-OFF-04), à revoir par le gérant. */
  rejectedOperations: number;
};

/**
 * Appareils d'un établissement (EF-CPT-04), du plus récent au plus ancien.
 * Le motif et l'auteur d'une révocation viennent du journal d'audit, qui
 * reste la source de vérité.
 */
export async function listDevices(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string },
): Promise<{
  establishment: { id: string; name: string; timeZone: string; enabledModules: string[] };
  devices: DeviceSummary[];
}> {
  const access = await authorize(db, actor, "core.device.revoke", {
    establishmentId: input.establishmentId,
  });
  const establishmentId = access.establishmentId;
  const establishment = await db.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
    select: { id: true, name: true, timeZone: true },
  });
  const devices = await db.device.findMany({
    where: { establishmentId },
    orderBy: { registeredAt: "desc" },
  });
  const { revocations, rejected, modules } = await withContext(
    db,
    access.dbContext,
    async (tx) => ({
      modules: await tx.establishmentModule.findMany({
        where: { establishmentId, enabled: true },
        select: { module: true },
      }),
      revocations: await tx.auditLog.findMany({
        where: {
          establishmentId,
          action: "core.device.revoked",
          entityId: { in: devices.map((device) => device.id) },
        },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, actorUserId: true, reason: true },
      }),
      rejected: await tx.syncOperation.groupBy({
        by: ["deviceId"],
        where: { establishmentId, status: "rejected" },
        _count: { _all: true },
      }),
    }),
  );
  const userIds = [
    ...new Set([
      ...devices.map((device) => device.registeredBy),
      ...revocations.flatMap((entry) => (entry.actorUserId ? [entry.actorUserId] : [])),
    ]),
  ];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true },
  });
  const names = new Map(users.map((user) => [user.id, user.displayName]));
  const rejectedByDevice = new Map(rejected.map((row) => [row.deviceId, row._count._all]));

  return {
    establishment: { ...establishment, enabledModules: modules.map((entry) => entry.module) },
    devices: devices.map((device) => {
      const revocation = revocations.find((entry) => entry.entityId === device.id);
      return {
        id: device.id,
        code: device.code,
        name: device.name,
        registeredAt: device.registeredAt.toISOString(),
        registeredByName: names.get(device.registeredBy) ?? "",
        lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
        revokedAt: device.revokedAt?.toISOString() ?? null,
        revokedByName: revocation?.actorUserId ? (names.get(revocation.actorUserId) ?? null) : null,
        revokedReason: device.revokedAt ? (revocation?.reason ?? null) : null,
        rejectedOperations: rejectedByDevice.get(device.id) ?? 0,
      };
    }),
  };
}

/** Dernier contact d'un appareil avec le serveur (envoi ou réception). */
export async function touchDevice(db: Db, deviceId: string, now: Date = new Date()): Promise<void> {
  await db.device.update({ where: { id: deviceId }, data: { lastSyncAt: now } });
}

/**
 * Résultat détaillé de l'authentification d'un appareil. Un établissement
 * suspendu (EF-ETB-03) n'est pas une révocation : l'appareil garde ses
 * données et ses opérations en attente, qui partiront à la réactivation.
 */
export type DeviceAuthResult =
  { status: "ok"; device: AuthenticatedDevice } | { status: "unknown" } | { status: "suspended" };

export async function resolveDevice(
  db: Db,
  authorization: string | null,
): Promise<DeviceAuthResult> {
  const match = /^Device ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/.exec(authorization ?? "");
  if (!match?.[1] || !match[2]) return { status: "unknown" };
  const device = await db.device.findUnique({
    where: { id: match[1] },
    include: { establishment: { select: { status: true, baseCurrency: true } } },
  });
  if (!device || device.revokedAt) return { status: "unknown" };
  if (!safeEqualHex(device.secretHash, sha256(match[2]))) return { status: "unknown" };
  if (device.establishment.status !== "active") return { status: "suspended" };
  return {
    status: "ok",
    device: {
      id: device.id,
      code: device.code,
      establishmentId: device.establishmentId,
      currency: device.establishment.baseCurrency,
    },
  };
}

/** Authentifie un appareil à partir de l'en-tête `Authorization: Device <id>.<secret>`. */
export async function authenticateDevice(
  db: Db,
  authorization: string | null,
): Promise<AuthenticatedDevice | null> {
  const result = await resolveDevice(db, authorization);
  return result.status === "ok" ? result.device : null;
}
