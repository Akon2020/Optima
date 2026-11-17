import type { User } from "@/generated/prisma/client";

import type { Db, Tx } from "../db/context";
import { randomToken, sha256 } from "./crypto";
import { AUTH_POLICY } from "./policy";

/**
 * Sessions côté serveur (CLAUDE.md § 5.2) : identifiant opaque dans un
 * cookie HttpOnly ; seule son empreinte SHA-256 est stockée.
 */
export type SessionUser = Pick<
  User,
  | "id"
  | "displayName"
  | "isOwner"
  | "mustChangePassword"
  | "totpEnabledAt"
  | "status"
  | "email"
  | "phone"
>;

export type ValidSession = {
  idHash: string;
  isElevated: boolean;
  expiresAt: Date;
  user: SessionUser;
};

function lifetimes(isOwner: boolean) {
  return {
    idle: isOwner ? AUTH_POLICY.idleTimeoutMs.owner : AUTH_POLICY.idleTimeoutMs.member,
    absolute: isOwner
      ? AUTH_POLICY.absoluteLifetimeMs.owner
      : AUTH_POLICY.absoluteLifetimeMs.member,
  };
}

export async function createSession(
  db: Db,
  input: {
    userId: string;
    isOwner: boolean;
    isElevated: boolean;
    ip?: string | null;
    userAgent?: string | null;
    now?: Date;
  },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + lifetimes(input.isOwner).absolute);
  await db.session.create({
    data: {
      idHash: sha256(token),
      userId: input.userId,
      isElevated: input.isElevated,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Valide un jeton : session existante, non révoquée, non expirée, active
 * récemment (RG-AUT-03) et compte non suspendu. Rafraîchit l'activité.
 */
export async function validateSession(
  db: Db,
  token: string | undefined,
  now: Date = new Date(),
): Promise<ValidSession | null> {
  if (!token) return null;
  const idHash = sha256(token);
  const session = await db.session.findUnique({
    where: { idHash },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          isOwner: true,
          mustChangePassword: true,
          totpEnabledAt: true,
          status: true,
          email: true,
          phone: true,
        },
      },
    },
  });
  if (!session || session.revokedAt) return null;
  const { idle } = lifetimes(session.user.isOwner);
  const isExpired =
    session.expiresAt.getTime() <= now.getTime() ||
    now.getTime() - session.lastSeenAt.getTime() > idle;
  if (isExpired || session.user.status !== "active") {
    await db.session.update({ where: { idHash }, data: { revokedAt: now } });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > AUTH_POLICY.touchIntervalMs) {
    await db.session.update({ where: { idHash }, data: { lastSeenAt: now } });
  }
  return {
    idHash,
    isElevated: session.isElevated,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

export async function revokeSession(db: Db, token: string, now: Date = new Date()): Promise<void> {
  await db.session.updateMany({
    where: { idHash: sha256(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Déconnexion forcée (EF-CPT-01) : toutes les sessions de l'utilisateur. */
export async function revokeAllSessions(
  db: Db | Tx,
  userId: string,
  options: { exceptIdHash?: string; now?: Date } = {},
): Promise<number> {
  const result = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptIdHash ? { NOT: { idHash: options.exceptIdHash } } : {}),
    },
    data: { revokedAt: options.now ?? new Date() },
  });
  return result.count;
}

/**
 * Élévation après la double authentification : l'identifiant de session
 * change (rotation, CLAUDE.md § 5.2), l'ancien est révoqué.
 */
export async function elevateSession(
  db: Db,
  token: string,
  meta: { ip?: string | null; userAgent?: string | null; now?: Date } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const current = await validateSession(db, token, meta.now);
  if (!current) throw new Error("Session invalide.");
  await revokeSession(db, token, meta.now);
  return createSession(db, {
    userId: current.user.id,
    isOwner: current.user.isOwner,
    isElevated: true,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    ...(meta.now ? { now: meta.now } : {}),
  });
}
