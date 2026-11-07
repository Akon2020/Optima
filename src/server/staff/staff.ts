import { DomainError } from "@/shared/lib/errors";

import type { MemberRole } from "@/modules/registry";

import { writeAudit } from "../audit/audit";
import { generateTemporaryPassword, hashPassword } from "../auth/password";
import { normalizeIdentifier } from "../auth/policy";
import { revokeAllSessions } from "../auth/sessions";
import { authorize, type Actor, type EstablishmentAccess } from "../authz/authorize";
import type { Db, Tx } from "../db/context";
import { toJson, withContext } from "../db/context";
import {
  assignableRoles,
  canManageMember,
  requiresServicePoint,
  type StaffActorRole,
} from "./rules";

/**
 * Gestion du personnel d'un établissement (EF-CPT-01 à 05, EF-AUT-02,
 * EF-AUT-04). Chaque action passe par `authorize`, est auditée, et diffuse
 * l'état du membre aux appareils (un membre suspendu ne peut plus reprendre
 * la main par son code PIN).
 */

export type StaffMemberSummary = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  servicePointId: string | null;
  servicePointName: string | null;
  status: "active" | "suspended";
  suspendedReason: string | null;
  suspendedAt: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  canManage: boolean;
};

export type StaffOverview = {
  establishment: { id: string; name: string; timeZone: string; enabledModules: string[] };
  viewer: { userId: string; role: StaffActorRole };
  assignableRoles: MemberRole[];
  servicePoints: { id: string; name: string }[];
  members: StaffMemberSummary[];
};

type Meta = { ip?: string | null; now?: Date };

const NAME_MIN = 2;
const NAME_MAX = 60;
const REASON_MIN = 3;
const REASON_MAX = 200;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new DomainError("INVALID_NAME", `Le nom compte de ${NAME_MIN} à ${NAME_MAX} caractères.`);
  }
  return name;
}

function cleanReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < REASON_MIN) {
    throw new DomainError("REASON_REQUIRED", "Indiquez le motif de la suspension.");
  }
  if (reason.length > REASON_MAX) {
    throw new DomainError("REASON_TOO_LONG", `Le motif tient en ${REASON_MAX} caractères au plus.`);
  }
  return reason;
}

async function staffAccess(db: Db, actor: Actor | null, establishmentId: string) {
  return authorize(db, actor, "core.staff.manage", { establishmentId });
}

/** Le membre ciblé, relu avec la condition d'établissement (IDOR). */
async function loadTarget(db: Db, establishmentId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { userId_establishmentId: { userId, establishmentId } },
    include: { user: true },
  });
  if (!membership || membership.user.isOwner) {
    throw new DomainError("NOT_FOUND", "Membre du personnel introuvable.");
  }
  return membership;
}

function assertCanManage(
  access: EstablishmentAccess,
  actor: Actor | null,
  target: { role: MemberRole; userId: string },
): void {
  if (!canManageMember({ role: access.role, userId: actor?.userId ?? "" }, target)) {
    throw new DomainError(
      "FORBIDDEN",
      target.userId === actor?.userId
        ? "Vous ne pouvez pas modifier votre propre compte ici."
        : "Seul le propriétaire gère les comptes des gérants.",
    );
  }
}

async function assertServicePoint(
  tx: Tx,
  establishmentId: string,
  role: MemberRole,
  servicePointId: string | null,
): Promise<string | null> {
  if (!requiresServicePoint(role)) return null;
  if (!servicePointId) {
    throw new DomainError("SERVICE_POINT_REQUIRED", "Choisissez le poste de préparation.");
  }
  const point = await tx.servicePoint.findFirst({
    where: { id: servicePointId, establishmentId },
    select: { id: true },
  });
  if (!point) throw new DomainError("NOT_FOUND", "Point de service introuvable.");
  return point.id;
}

/** État diffusé aux appareils (GET /api/sync/pull, entité `staff_member`). */
async function broadcast(
  tx: Tx,
  establishmentId: string,
  member: { userId: string; name: string; role: MemberRole; status: "active" | "suspended" },
): Promise<void> {
  await tx.changeLog.create({
    data: {
      establishmentId,
      entity: "staff_member",
      entityId: member.userId,
      data: toJson({
        id: member.userId,
        establishmentId,
        name: member.name,
        role: member.role,
        status: member.status,
      }),
    },
  });
}

export async function listStaff(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string },
): Promise<StaffOverview> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const establishmentId = access.establishmentId;
  const establishment = await db.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
    select: { id: true, name: true, timeZone: true },
  });
  const memberships = await db.membership.findMany({
    where: { establishmentId, user: { isOwner: false } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const { modules, servicePoints, suspensions } = await withContext(
    db,
    access.dbContext,
    async (tx) => ({
      modules: await tx.establishmentModule.findMany({
        where: { establishmentId, enabled: true },
        select: { module: true },
      }),
      servicePoints: await tx.servicePoint.findMany({
        where: { establishmentId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      suspensions: await tx.auditLog.findMany({
        where: { establishmentId, action: "core.staff.suspended" },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, reason: true, createdAt: true },
      }),
    }),
  );
  const pointName = new Map(servicePoints.map((point) => [point.id, point.name]));
  const viewer = { userId: actor?.userId ?? "", role: access.role };

  const members = memberships.map((membership): StaffMemberSummary => {
    const suspension =
      membership.status === "suspended"
        ? suspensions.find((entry) => entry.entityId === membership.userId)
        : undefined;
    return {
      userId: membership.userId,
      name: membership.user.displayName,
      email: membership.user.email,
      phone: membership.user.phone,
      role: membership.role,
      servicePointId: membership.servicePointId,
      servicePointName: membership.servicePointId
        ? (pointName.get(membership.servicePointId) ?? null)
        : null,
      status: membership.status,
      suspendedReason: suspension?.reason ?? null,
      suspendedAt: suspension?.createdAt.toISOString() ?? null,
      mustChangePassword: membership.user.mustChangePassword,
      lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
      createdAt: membership.createdAt.toISOString(),
      canManage: canManageMember(viewer, { role: membership.role, userId: membership.userId }),
    };
  });

  return {
    establishment: { ...establishment, enabledModules: modules.map((entry) => entry.module) },
    viewer,
    assignableRoles: assignableRoles(access.role),
    servicePoints,
    members,
  };
}

/**
 * Création d'un compte (EF-AUT-02) : mot de passe provisoire lisible, montré
 * une seule fois, changement obligatoire à la première connexion.
 */
export async function createStaffMember(
  db: Db,
  actor: Actor | null,
  input: {
    establishmentId: string;
    name: string;
    identifier: string;
    role: MemberRole;
    servicePointId?: string | null;
  },
  meta: Meta = {},
): Promise<{ userId: string; temporaryPassword: string }> {
  const access = await staffAccess(db, actor, input.establishmentId);
  if (!assignableRoles(access.role).includes(input.role)) {
    throw new DomainError("FORBIDDEN", "Seul le propriétaire crée les comptes des gérants.");
  }
  const name = cleanName(input.name);
  const identifier = normalizeIdentifier(input.identifier);
  if (!identifier) {
    throw new DomainError(
      "INVALID_IDENTIFIER",
      "Saisissez une adresse e-mail ou un numéro de téléphone valide (8 à 15 chiffres).",
    );
  }
  const taken = await db.user.findFirst({
    where: identifier.kind === "email" ? { email: identifier.value } : { phone: identifier.value },
    select: { id: true },
  });
  if (taken) throw new DomainError("IDENTIFIER_TAKEN", "Cet identifiant est déjà utilisé.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  // Une seule transaction : compte, appartenance, diffusion et audit (CLAUDE.md § 3.7).
  const userId = await withContext(db, access.dbContext, async (tx) => {
    const servicePointId = await assertServicePoint(
      tx,
      access.establishmentId,
      input.role,
      input.servicePointId ?? null,
    );
    const user = await tx.user.create({
      data: {
        ...(identifier.kind === "email"
          ? { email: identifier.value }
          : { phone: identifier.value }),
        displayName: name,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await tx.membership.create({
      data: {
        userId: user.id,
        establishmentId: access.establishmentId,
        role: input.role,
        servicePointId,
      },
    });
    await broadcast(tx, access.establishmentId, {
      userId: user.id,
      name,
      role: input.role,
      status: "active",
    });
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.created",
      entity: "user",
      entityId: user.id,
      after: { name, identifier: identifier.value, role: input.role, servicePointId },
      ip: meta.ip ?? null,
    });
    return user.id;
  });
  return { userId, temporaryPassword };
}

/** Nom, rôle et point de service. Changer de rôle ferme les sessions ouvertes. */
export async function updateStaffMember(
  db: Db,
  actor: Actor | null,
  input: {
    establishmentId: string;
    userId: string;
    name: string;
    role: MemberRole;
    servicePointId?: string | null;
  },
  meta: Meta = {},
): Promise<void> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const target = await loadTarget(db, access.establishmentId, input.userId);
  assertCanManage(access, actor, { role: target.role, userId: target.userId });
  if (!assignableRoles(access.role).includes(input.role)) {
    throw new DomainError("FORBIDDEN", "Seul le propriétaire attribue le rôle de gérant.");
  }
  const name = cleanName(input.name);

  await withContext(db, access.dbContext, async (tx) => {
    const servicePointId = await assertServicePoint(
      tx,
      access.establishmentId,
      input.role,
      input.servicePointId ?? null,
    );
    await tx.user.update({ where: { id: target.userId }, data: { displayName: name } });
    await tx.membership.update({
      where: { id: target.id },
      data: { role: input.role, servicePointId },
    });
    // Nouveau rôle, nouveaux droits : les sessions ouvertes avec l'ancien sont fermées.
    if (input.role !== target.role) await revokeAllSessions(tx, target.userId, meta);
    await broadcast(tx, access.establishmentId, {
      userId: target.userId,
      name,
      role: input.role,
      status: target.status,
    });
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.updated",
      entity: "user",
      entityId: target.userId,
      before: {
        name: target.user.displayName,
        role: target.role,
        servicePointId: target.servicePointId,
      },
      after: { name, role: input.role, servicePointId },
      ip: meta.ip ?? null,
    });
  });
}

/**
 * Réinitialisation du mot de passe (EF-AUT-04) : nouveau mot de passe
 * provisoire, montré une seule fois, et déconnexion de toutes les sessions.
 */
export async function resetStaffPassword(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; userId: string },
  meta: Meta = {},
): Promise<{ temporaryPassword: string }> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const target = await loadTarget(db, access.establishmentId, input.userId);
  assertCanManage(access, actor, { role: target.role, userId: target.userId });
  if (target.status !== "active") {
    throw new DomainError("SUSPENDED", "Réactivez d'abord ce compte.");
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await withContext(db, access.dbContext, async (tx) => {
    await tx.user.update({
      where: { id: target.userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await revokeAllSessions(tx, target.userId, meta);
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.password-reset",
      entity: "user",
      entityId: target.userId,
      ip: meta.ip ?? null,
    });
  });
  return { temporaryPassword };
}

/**
 * Suspension (EF-CPT-05) : motif obligatoire, accès fermé immédiatement
 * (sessions révoquées, appareils prévenus), nom conservé sur ses documents.
 */
export async function suspendStaffMember(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; userId: string; reason: string },
  meta: Meta = {},
): Promise<void> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const target = await loadTarget(db, access.establishmentId, input.userId);
  assertCanManage(access, actor, { role: target.role, userId: target.userId });
  const reason = cleanReason(input.reason);
  if (target.status === "suspended") {
    throw new DomainError("ALREADY_SUSPENDED", "Ce compte est déjà suspendu.");
  }
  await withContext(db, access.dbContext, async (tx) => {
    await tx.membership.update({ where: { id: target.id }, data: { status: "suspended" } });
    await revokeAllSessions(tx, target.userId, meta);
    await broadcast(tx, access.establishmentId, {
      userId: target.userId,
      name: target.user.displayName,
      role: target.role,
      status: "suspended",
    });
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.suspended",
      entity: "user",
      entityId: target.userId,
      reason,
      ip: meta.ip ?? null,
    });
  });
}

export async function reactivateStaffMember(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; userId: string },
  meta: Meta = {},
): Promise<void> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const target = await loadTarget(db, access.establishmentId, input.userId);
  assertCanManage(access, actor, { role: target.role, userId: target.userId });
  if (target.status === "active") {
    throw new DomainError("ALREADY_ACTIVE", "Ce compte est déjà actif.");
  }
  await withContext(db, access.dbContext, async (tx) => {
    await tx.membership.update({ where: { id: target.id }, data: { status: "active" } });
    await broadcast(tx, access.establishmentId, {
      userId: target.userId,
      name: target.user.displayName,
      role: target.role,
      status: "active",
    });
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.reactivated",
      entity: "user",
      entityId: target.userId,
      ip: meta.ip ?? null,
    });
  });
}

/** Déconnexion forcée de toutes les sessions web (EF-CPT-01). */
export async function signOutStaffMember(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; userId: string },
  meta: Meta = {},
): Promise<{ sessions: number }> {
  const access = await staffAccess(db, actor, input.establishmentId);
  const target = await loadTarget(db, access.establishmentId, input.userId);
  assertCanManage(access, actor, { role: target.role, userId: target.userId });
  return withContext(db, access.dbContext, async (tx) => {
    const sessions = await revokeAllSessions(tx, target.userId, meta);
    await writeAudit(tx, {
      establishmentId: access.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "core.staff.signed-out",
      entity: "user",
      entityId: target.userId,
      after: { sessions },
      ip: meta.ip ?? null,
    });
    return { sessions };
  });
}
