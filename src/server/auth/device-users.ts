import { DomainError } from "@/shared/lib/errors";

import { writeAudit } from "../audit/audit";
import type { Db } from "../db/context";
import { withContext } from "../db/context";
import type { AuthenticatedDevice } from "../sync/devices";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { AUTH_POLICY, normalizeIdentifier } from "./policy";

/**
 * Connexion d'un membre du personnel SUR un appareil appairé (EF-AUT-01,
 * RG-OFF-02) : le mot de passe est vérifié en ligne, une fois ; l'appareil
 * peut ensuite reprendre la main par code PIN (EF-AUT-05). Mêmes règles de
 * blocage que la connexion web (RG-AUT-02).
 */
export type DeviceUser = { userId: string; name: string; role: string };

export async function verifyDeviceUser(
  db: Db,
  device: AuthenticatedDevice,
  input: { identifier: string; password: string },
  meta: { ip: string; now?: Date },
): Promise<DeviceUser> {
  const now = meta.now ?? new Date();
  const normalized = normalizeIdentifier(input.identifier);
  const identifier = normalized?.value ?? input.identifier.trim().toLowerCase().slice(0, 120);
  const since = new Date(now.getTime() - AUTH_POLICY.failedAttemptsWindowMs);
  const [byAccount, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { identifier, succeeded: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip: meta.ip, succeeded: false, createdAt: { gte: since } } }),
  ]);
  if (byAccount >= AUTH_POLICY.maxFailedAttempts || byIp >= AUTH_POLICY.maxFailedAttempts) {
    throw new DomainError("LOCKED", "Trop de tentatives. Patientez 15 minutes avant de réessayer.");
  }

  const user = normalized
    ? await db.user.findFirst({
        where:
          normalized.kind === "email" ? { email: normalized.value } : { phone: normalized.value },
      })
    : null;
  const isValid = user
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyAgainstDummy(input.password);
  await db.loginAttempt.create({
    data: { identifier, ip: meta.ip, succeeded: Boolean(user && isValid), createdAt: now },
  });

  // Le résultat est décidé AVANT l'écriture du journal : un mot de passe
  // correct mais refusé (compte suspendu, propriétaire, mot de passe provisoire,
  // autre établissement) est un refus, jamais une connexion réussie.
  let refusal: DomainError | null = null;
  let role: string | null = null;
  if (user && isValid) {
    const membership = user.isOwner
      ? null
      : await db.membership.findUnique({
          where: {
            userId_establishmentId: { userId: user.id, establishmentId: device.establishmentId },
          },
        });
    role = user.isOwner ? "owner" : (membership?.role ?? null);
    if (user.status !== "active") {
      refusal = new DomainError("SUSPENDED", "Ce compte est suspendu. Contactez votre gérant.");
    } else if (user.isOwner) {
      refusal = new DomainError(
        "OWNER_NOT_ON_DEVICE",
        "Le propriétaire travaille depuis l'espace propriétaire, protégé par la double authentification.",
      );
    } else if (user.mustChangePassword) {
      refusal = new DomainError(
        "MUST_CHANGE_PASSWORD",
        "Changez d'abord votre mot de passe provisoire en vous connectant sur la page Connexion.",
      );
    } else if (!membership || membership.status !== "active") {
      refusal = new DomainError("NOT_A_MEMBER", "Ce compte n'appartient pas à cet établissement.");
    }
  }

  const action =
    !user || !isValid
      ? "auth.device-login.failed"
      : refusal
        ? "auth.device-login.refused"
        : "auth.device-login.succeeded";
  await withContext(db, { establishmentId: device.establishmentId, isOwner: false }, (tx) =>
    writeAudit(tx, {
      establishmentId: device.establishmentId,
      actorUserId: user && isValid ? user.id : null,
      actorRole: role,
      deviceId: device.id,
      action,
      entity: "device",
      entityId: device.id,
      after: { identifier },
      reason: refusal?.code ?? null,
      ip: meta.ip,
    }),
  );

  if (!user || !isValid) {
    throw new DomainError("INVALID_CREDENTIALS", "Identifiant ou mot de passe incorrect.");
  }
  if (refusal) throw refusal;
  return { userId: user.id, name: user.displayName, role: role ?? "waiter" };
}
