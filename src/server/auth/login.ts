import { DomainError } from "@/shared/lib/errors";

import { writeAudit } from "../audit/audit";
import type { Db } from "../db/context";
import { withContext } from "../db/context";
import { decryptSecret, encryptSecret, safeEqualHex, sha256 } from "./crypto";
import { checkPasswordPolicy, hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { AUTH_POLICY, normalizeIdentifier } from "./policy";
import { createSession, elevateSession, revokeAllSessions, validateSession } from "./sessions";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "./totp";

/** Étape suivante après une connexion réussie. */
export type LoginNext = "change-password" | "totp-setup" | "totp" | "home";

export type LoginResult =
  | { status: "invalid" }
  | { status: "locked" }
  | { status: "suspended" }
  | { status: "ok"; token: string; expiresAt: Date; next: LoginNext };

type RequestMeta = { ip: string; userAgent?: string | null; now?: Date };

const GLOBAL = { establishmentId: null, isOwner: false };

/** RG-AUT-02 : blocage après 5 échecs en 15 minutes, par compte et par IP. */
async function isLocked(db: Db, identifier: string, ip: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - AUTH_POLICY.failedAttemptsWindowMs);
  const [byAccount, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { identifier, succeeded: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, succeeded: false, createdAt: { gte: since } } }),
  ]);
  return byAccount >= AUTH_POLICY.maxFailedAttempts || byIp >= AUTH_POLICY.maxFailedAttempts;
}

export function nextStep(user: {
  mustChangePassword: boolean;
  isOwner: boolean;
  totpEnabledAt: Date | null;
}): LoginNext {
  if (user.mustChangePassword) return "change-password";
  if (user.isOwner && !user.totpEnabledAt) return "totp-setup";
  if (user.isOwner) return "totp";
  return "home";
}

/**
 * Connexion par identifiant et mot de passe (EF-AUT-01). Les messages ne
 * révèlent pas si le compte existe. Chaque tentative est tracée.
 */
export async function login(
  db: Db,
  input: { identifier: string; password: string },
  meta: RequestMeta,
): Promise<LoginResult> {
  const now = meta.now ?? new Date();
  const normalized = normalizeIdentifier(input.identifier);
  const identifier = normalized?.value ?? input.identifier.trim().toLowerCase().slice(0, 120);

  if (await isLocked(db, identifier, meta.ip, now)) {
    await db.loginAttempt.create({
      data: { identifier, ip: meta.ip, succeeded: false, createdAt: now },
    });
    return { status: "locked" };
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
  await withContext(db, GLOBAL, (tx) =>
    writeAudit(tx, {
      establishmentId: null,
      actorUserId: user && isValid ? user.id : null,
      actorRole: user?.isOwner ? "owner" : null,
      action: user && isValid ? "auth.login.succeeded" : "auth.login.failed",
      entity: "user",
      entityId: user && isValid ? user.id : null,
      after: { identifier },
      ip: meta.ip,
    }),
  );

  if (!user || !isValid) return { status: "invalid" };
  if (user.status !== "active") return { status: "suspended" };

  const next = nextStep(user);
  const session = await createSession(db, {
    userId: user.id,
    isOwner: user.isOwner,
    // Le propriétaire n'est « élevé » qu'après la double authentification.
    isElevated: !user.isOwner,
    ip: meta.ip,
    userAgent: meta.userAgent ?? null,
    now,
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  return { status: "ok", token: session.token, expiresAt: session.expiresAt, next };
}

/**
 * Changement de mot de passe (EF-AUT-02 à la première connexion) : le mot
 * de passe actuel est exigé, les autres sessions sont fermées.
 */
export async function changePassword(
  db: Db,
  input: { token: string; currentPassword: string; newPassword: string },
  meta: RequestMeta,
): Promise<LoginNext> {
  const session = await validateSession(db, input.token, meta.now);
  if (!session)
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré. Reconnectez-vous.");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new DomainError("INVALID_PASSWORD", "Le mot de passe actuel est incorrect.");
  }
  if (input.newPassword === input.currentPassword) {
    throw new DomainError("SAME_PASSWORD", "Choisissez un mot de passe différent de l'actuel.");
  }
  const policyError = checkPasswordPolicy(input.newPassword, [
    user.displayName,
    user.email ?? "",
    user.phone ?? "",
  ]);
  if (policyError) throw new DomainError("WEAK_PASSWORD", policyError);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  });
  await revokeAllSessions(db, user.id, { exceptIdHash: session.idHash });
  await withContext(db, GLOBAL, (tx) =>
    writeAudit(tx, {
      establishmentId: null,
      actorUserId: user.id,
      actorRole: user.isOwner ? "owner" : null,
      action: "auth.password.changed",
      entity: "user",
      entityId: user.id,
      ip: meta.ip,
    }),
  );
  return nextStep(updated);
}

/** Début de l'activation TOTP : secret chiffré en attente de confirmation. */
export async function beginTotpSetup(
  db: Db,
  input: { token: string; encryptionKey: string },
  meta: RequestMeta,
): Promise<{ secret: string; uri: string }> {
  const session = await validateSession(db, input.token, meta.now);
  if (!session)
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré. Reconnectez-vous.");
  if (session.user.totpEnabledAt) {
    throw new DomainError("TOTP_ALREADY_ENABLED", "La double authentification est déjà active.");
  }
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: session.user.id },
    data: { totpSecretEnc: encryptSecret(secret, input.encryptionKey) },
  });
  const account = session.user.email ?? session.user.phone ?? session.user.displayName;
  return { secret, uri: otpauthUri(secret, account) };
}

/**
 * Confirmation de l'activation TOTP : le code prouve que l'application est
 * bien configurée. Les codes de secours sont renvoyés une seule fois.
 */
export async function confirmTotpSetup(
  db: Db,
  input: { token: string; code: string; encryptionKey: string },
  meta: RequestMeta,
): Promise<{ token: string; expiresAt: Date; recoveryCodes: string[] }> {
  const now = meta.now ?? new Date();
  const session = await validateSession(db, input.token, now);
  if (!session)
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré. Reconnectez-vous.");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.totpSecretEnc || user.totpEnabledAt) {
    throw new DomainError(
      "TOTP_NOT_PENDING",
      "Recommencez l'activation de la double authentification.",
    );
  }
  const secret = decryptSecret(user.totpSecretEnc, input.encryptionKey);
  if (!verifyTotp(secret, input.code, now.getTime())) {
    throw new DomainError(
      "INVALID_CODE",
      "Code incorrect. Vérifiez l'heure du téléphone et réessayez.",
    );
  }
  const recoveryCodes = generateRecoveryCodes();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpEnabledAt: now } }),
    db.recoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: user.id,
        codeHash: sha256(normalizeRecoveryCode(code)),
      })),
    }),
  ]);
  await withContext(db, GLOBAL, (tx) =>
    writeAudit(tx, {
      establishmentId: null,
      actorUserId: user.id,
      actorRole: "owner",
      action: "auth.totp.enabled",
      entity: "user",
      entityId: user.id,
      ip: meta.ip,
    }),
  );
  const elevated = await elevateSession(db, input.token, { ...meta, now });
  return { ...elevated, recoveryCodes };
}

/** Vérification TOTP à la connexion, ou par un code de secours à usage unique. */
export async function verifySecondFactor(
  db: Db,
  input: { token: string; code: string; encryptionKey: string },
  meta: RequestMeta,
): Promise<{ token: string; expiresAt: Date }> {
  const now = meta.now ?? new Date();
  const session = await validateSession(db, input.token, now);
  if (!session)
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré. Reconnectez-vous.");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.totpSecretEnc || !user.totpEnabledAt) {
    throw new DomainError("TOTP_NOT_ENABLED", "La double authentification n'est pas activée.");
  }
  if (await isLocked(db, user.id, meta.ip, now)) {
    throw new DomainError("LOCKED", "Trop d'essais. Patientez 15 minutes avant de réessayer.");
  }

  let isValid = verifyTotp(
    decryptSecret(user.totpSecretEnc, input.encryptionKey),
    input.code,
    now.getTime(),
  );
  if (!isValid && input.code.replace(/[\s-]/g, "").length === 10) {
    const hash = sha256(normalizeRecoveryCode(input.code));
    const codes = await db.recoveryCode.findMany({ where: { userId: user.id, usedAt: null } });
    const match = codes.find((code) => safeEqualHex(code.codeHash, hash));
    if (match) {
      await db.recoveryCode.update({ where: { id: match.id }, data: { usedAt: now } });
      isValid = true;
    }
  }
  await db.loginAttempt.create({
    data: { identifier: user.id, ip: meta.ip, succeeded: isValid, createdAt: now },
  });
  if (!isValid) throw new DomainError("INVALID_CODE", "Code incorrect.");
  return elevateSession(db, input.token, { ...meta, now });
}
