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
): Promise<void> {
  const access = await authorize(db, actor, "core.device.revoke", {
    establishmentId: input.establishmentId,
  });
  if (input.reason.trim().length < 3) {
    throw new DomainError("REASON_REQUIRED", "Indiquez le motif de la révocation.");
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
    }),
  );
}

/** Authentifie un appareil à partir de l'en-tête `Authorization: Device <id>.<secret>`. */
export async function authenticateDevice(
  db: Db,
  authorization: string | null,
): Promise<AuthenticatedDevice | null> {
  const match = /^Device ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/.exec(authorization ?? "");
  if (!match?.[1] || !match[2]) return null;
  const device = await db.device.findUnique({
    where: { id: match[1] },
    include: { establishment: { select: { status: true, baseCurrency: true } } },
  });
  if (!device || device.revokedAt || device.establishment.status !== "active") return null;
  if (!safeEqualHex(device.secretHash, sha256(match[2]))) return null;
  return {
    id: device.id,
    code: device.code,
    establishmentId: device.establishmentId,
    currency: device.establishment.baseCurrency,
  };
}
