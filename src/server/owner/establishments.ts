import type { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import {
  createEstablishmentSchema,
  identitySchema,
  missingHeaderFields,
  readSettings,
  type CreateEstablishmentInput,
  type IdentityInput,
} from "@/modules/owner";
import {
  ESTABLISHMENT_TYPES,
  MODULES,
  OPTIONAL_MODULES,
  activeDependents,
  missingDependencies,
  type ModuleId,
} from "@/modules/registry";

import { writeAudit } from "../audit/audit";
import { requireOwner, type Actor } from "../authz/authorize";
import type { Db, Tx } from "../db/context";
import { toJson, withContext } from "../db/context";

/**
 * Gestion des établissements par le propriétaire (EF-ETB-01 à 03, EF-MOD-01,
 * RG-MOD-01, RG-MOD-02, RG-ETB-01, RG-PRO-01). Chaque action est inscrite au
 * journal de l'établissement concerné, visible par son gérant.
 */

type Meta = { ip?: string | null };

/** Points de service habituels d'un restaurant (D-007 : comptoir, cuisine, grillade). */
const DEFAULT_SERVICE_POINTS = [
  { kind: "counter", name: "Comptoir", menu: "drinks", sortOrder: 1 },
  { kind: "kitchen", name: "Cuisine", menu: "food", sortOrder: 2 },
  { kind: "grill", name: "Grillade", menu: "food", sortOrder: 3 },
] as const;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
  }
  return parsed.data;
}

function ownerContext(establishmentId: string) {
  return { establishmentId, isOwner: true };
}

async function audit(
  tx: Tx,
  actor: Actor,
  entry: {
    establishmentId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
  meta: Meta,
): Promise<void> {
  await writeAudit(tx, {
    establishmentId: entry.establishmentId,
    actorUserId: actor.userId,
    actorRole: "owner",
    action: entry.action,
    entity: "establishment",
    entityId: entry.establishmentId,
    before: entry.before,
    after: entry.after,
    reason: entry.reason ?? null,
    ip: meta.ip ?? null,
  });
}

async function loadEstablishment(db: Db, id: string) {
  const establishment = await db.establishment.findUnique({ where: { id } });
  if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
  return establishment;
}

export type EstablishmentListItem = {
  id: string;
  slug: string;
  name: string;
  type: string;
  currency: string;
  status: "active" | "suspended";
  modules: string[];
  staff: number;
  devices: number;
  createdAt: string;
};

export async function listEstablishments(
  db: Db,
  actor: Actor | null,
): Promise<EstablishmentListItem[]> {
  requireOwner(actor);
  const establishments = await db.establishment.findMany({ orderBy: { createdAt: "asc" } });
  const [modules, staff, devices] = await Promise.all([
    withContext(db, { establishmentId: null, isOwner: true }, (tx) =>
      tx.establishmentModule.findMany({ where: { enabled: true } }),
    ),
    db.membership.groupBy({
      by: ["establishmentId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    db.device.groupBy({
      by: ["establishmentId"],
      where: { revokedAt: null },
      _count: { _all: true },
    }),
  ]);
  return establishments.map((establishment) => ({
    id: establishment.id,
    slug: establishment.slug,
    name: establishment.name,
    type: establishment.type,
    currency: establishment.baseCurrency,
    status: establishment.status,
    modules: modules
      .filter((entry) => entry.establishmentId === establishment.id)
      .map((entry) => entry.module),
    staff: staff.find((row) => row.establishmentId === establishment.id)?._count._all ?? 0,
    devices: devices.find((row) => row.establishmentId === establishment.id)?._count._all ?? 0,
    createdAt: establishment.createdAt.toISOString(),
  }));
}

export type ModuleState = {
  id: ModuleId;
  name: string;
  enabled: boolean;
  /** Modules à activer d'abord (RG-MOD-02). */
  missing: string[];
  /** Modules actifs qui dépendent de celui-ci et empêchent de le désactiver. */
  blockedBy: string[];
};

export type EstablishmentDetail = {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  type: string;
  typeName: string;
  currency: string;
  timeZone: string;
  status: "active" | "suspended";
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  missingHeaderFields: string[];
  modules: ModuleState[];
  staff: number;
  devices: number;
};

const moduleName = (id: string) => MODULES.find((entry) => entry.id === id)?.name ?? id;

export async function getEstablishment(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string },
): Promise<EstablishmentDetail> {
  requireOwner(actor);
  const establishment = await loadEstablishment(db, input.establishmentId);
  const { settings, modules, suspension } = await withContext(
    db,
    ownerContext(establishment.id),
    async (tx) => ({
      settings: await tx.establishmentSettings.findUnique({
        where: { establishmentId: establishment.id },
      }),
      modules: await tx.establishmentModule.findMany({
        where: { establishmentId: establishment.id },
      }),
      suspension: await tx.auditLog.findFirst({
        where: { establishmentId: establishment.id, action: "owner.establishment.suspended" },
        orderBy: { createdAt: "desc" },
        select: { reason: true },
      }),
    }),
  );
  const [staff, devices] = await Promise.all([
    db.membership.count({ where: { establishmentId: establishment.id, status: "active" } }),
    db.device.count({ where: { establishmentId: establishment.id, revokedAt: null } }),
  ]);
  const identity = readSettings(settings?.settings).identity;
  const enabled = new Set(modules.filter((entry) => entry.enabled).map((entry) => entry.module));

  return {
    id: establishment.id,
    slug: establishment.slug,
    name: establishment.name,
    legalName: establishment.legalName,
    address: identity.address,
    phone: identity.phone,
    type: establishment.type,
    typeName:
      ESTABLISHMENT_TYPES.find((type) => type.id === establishment.type)?.name ??
      establishment.type,
    currency: establishment.baseCurrency,
    timeZone: establishment.timeZone,
    status: establishment.status,
    suspendedAt: establishment.suspendedAt?.toISOString() ?? null,
    suspendedReason: establishment.status === "suspended" ? (suspension?.reason ?? null) : null,
    createdAt: establishment.createdAt.toISOString(),
    missingHeaderFields: missingHeaderFields({
      name: establishment.name,
      legalName: establishment.legalName,
      address: identity.address,
      phone: identity.phone,
    }),
    modules: OPTIONAL_MODULES.map((definition) => ({
      id: definition.id,
      name: definition.name,
      enabled: enabled.has(definition.id),
      missing: missingDependencies(definition.id, enabled).map(moduleName),
      blockedBy: activeDependents(definition.id, enabled).map(moduleName),
    })),
    staff,
    devices,
  };
}

/** Création (EF-ETB-01) : la devise de base est figée dès maintenant (RG-ETB-01). */
export async function createEstablishment(
  db: Db,
  actor: Actor | null,
  input: CreateEstablishmentInput,
  meta: Meta = {},
): Promise<{ id: string; slug: string }> {
  const owner = requireOwner(actor);
  const data = parse(createEstablishmentSchema, input);
  if (await db.establishment.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
    throw new DomainError("SLUG_TAKEN", "Cette adresse est déjà utilisée par un établissement.");
  }
  const type = ESTABLISHMENT_TYPES.find((entry) => entry.id === data.type);
  if (!type) throw new DomainError("INVALID_INPUT", "Type d'activité inconnu.");

  return db.$transaction(async (tx) => {
    const establishment = await tx.establishment.create({
      data: {
        slug: data.slug,
        name: data.name,
        legalName: data.legalName,
        type: data.type,
        baseCurrency: data.currency,
        timeZone: data.timeZone,
      },
    });
    await tx.$executeRaw`SELECT
      set_config('app.establishment_id', ${establishment.id}, true),
      set_config('app.is_owner', 'true', true)`;
    await tx.establishmentModule.createMany({
      data: type.defaultModules.map((module) => ({
        establishmentId: establishment.id,
        module,
        enabled: true,
      })),
    });
    await tx.establishmentSettings.create({
      data: {
        establishmentId: establishment.id,
        settings: toJson({
          version: 1,
          identity: { address: data.address, phone: data.phone },
        }),
      },
    });
    if (data.type === "restaurant" && data.withDefaultServicePoints) {
      await tx.servicePoint.createMany({
        data: DEFAULT_SERVICE_POINTS.map((point) => ({
          ...point,
          establishmentId: establishment.id,
        })),
      });
    }
    await audit(
      tx,
      owner,
      {
        establishmentId: establishment.id,
        action: "owner.establishment.created",
        after: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          currency: data.currency,
          timeZone: data.timeZone,
          modules: type.defaultModules,
        },
      },
      meta,
    );
    return { id: establishment.id, slug: establishment.slug };
  });
}

/** Identité et en-tête imprimé (EF-ETB-01, EF-ETB-02). La devise ne se modifie pas. */
export async function updateEstablishmentIdentity(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string } & IdentityInput,
  meta: Meta = {},
): Promise<void> {
  const owner = requireOwner(actor);
  const establishment = await loadEstablishment(db, input.establishmentId);
  const data = parse(identitySchema, input);
  await withContext(db, ownerContext(establishment.id), async (tx) => {
    const current = await tx.establishmentSettings.findUnique({
      where: { establishmentId: establishment.id },
    });
    const settings = readSettings(current?.settings);
    await tx.establishment.update({
      where: { id: establishment.id },
      data: { name: data.name, legalName: data.legalName },
    });
    const next = { ...settings, identity: { address: data.address, phone: data.phone } };
    await tx.establishmentSettings.upsert({
      where: { establishmentId: establishment.id },
      create: { establishmentId: establishment.id, settings: toJson(next) },
      update: { settings: toJson(next), version: { increment: 1 } },
    });
    await audit(
      tx,
      owner,
      {
        establishmentId: establishment.id,
        action: "owner.establishment.updated",
        before: {
          name: establishment.name,
          legalName: establishment.legalName,
          ...settings.identity,
        },
        after: data,
      },
      meta,
    );
  });
}

/**
 * Activation d'un module (EF-MOD-01). RG-MOD-02 : ses dépendances doivent
 * être actives ; à l'inverse, un module dont d'autres dépendent ne se
 * désactive pas. RG-MOD-01 : désactiver n'efface aucune donnée.
 */
export async function setModuleEnabled(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; module: string; enabled: boolean },
  meta: Meta = {},
): Promise<void> {
  const owner = requireOwner(actor);
  const definition = OPTIONAL_MODULES.find((entry) => entry.id === input.module);
  if (!definition) throw new DomainError("INVALID_MODULE", "Ce module ne s'active pas ici.");
  const establishment = await loadEstablishment(db, input.establishmentId);

  await withContext(db, ownerContext(establishment.id), async (tx) => {
    const rows = await tx.establishmentModule.findMany({
      where: { establishmentId: establishment.id },
    });
    const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.module));
    if (enabled.has(definition.id) === input.enabled) return;
    if (input.enabled) {
      const missing = missingDependencies(definition.id, enabled);
      if (missing.length > 0) {
        throw new DomainError(
          "MODULE_DEPENDENCY",
          `Activez d'abord : ${missing.map(moduleName).join(", ")}.`,
        );
      }
    } else {
      const dependents = activeDependents(definition.id, enabled);
      if (dependents.length > 0) {
        throw new DomainError(
          "MODULE_REQUIRED",
          `Désactivez d'abord : ${dependents.map(moduleName).join(", ")}.`,
        );
      }
    }
    await tx.establishmentModule.upsert({
      where: {
        establishmentId_module: { establishmentId: establishment.id, module: definition.id },
      },
      create: { establishmentId: establishment.id, module: definition.id, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    await audit(
      tx,
      owner,
      {
        establishmentId: establishment.id,
        action: input.enabled ? "owner.module.enabled" : "owner.module.disabled",
        after: { module: definition.id },
      },
      meta,
    );
  });
}

/**
 * Suspension (EF-ETB-03) : plus personne n'agit dans l'établissement, ses
 * appareils gardent leurs données ; la réactivation rend l'accès à l'identique.
 */
export async function suspendEstablishment(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; reason: string },
  meta: Meta = {},
): Promise<void> {
  const owner = requireOwner(actor);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("REASON_REQUIRED", "Indiquez le motif.");
  if (reason.length > 200) {
    throw new DomainError("REASON_TOO_LONG", "Le motif tient en 200 caractères au plus.");
  }
  const establishment = await loadEstablishment(db, input.establishmentId);
  if (establishment.status === "suspended") {
    throw new DomainError("ALREADY_SUSPENDED", "Cet établissement est déjà suspendu.");
  }
  await withContext(db, ownerContext(establishment.id), async (tx) => {
    await tx.establishment.update({
      where: { id: establishment.id },
      data: { status: "suspended", suspendedAt: new Date() },
    });
    await audit(
      tx,
      owner,
      { establishmentId: establishment.id, action: "owner.establishment.suspended", reason },
      meta,
    );
  });
}

export async function reactivateEstablishment(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string },
  meta: Meta = {},
): Promise<void> {
  const owner = requireOwner(actor);
  const establishment = await loadEstablishment(db, input.establishmentId);
  if (establishment.status === "active") {
    throw new DomainError("ALREADY_ACTIVE", "Cet établissement est déjà actif.");
  }
  await withContext(db, ownerContext(establishment.id), async (tx) => {
    await tx.establishment.update({
      where: { id: establishment.id },
      data: { status: "active", suspendedAt: null },
    });
    await audit(
      tx,
      owner,
      { establishmentId: establishment.id, action: "owner.establishment.reactivated" },
      meta,
    );
  });
}
