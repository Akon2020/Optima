import { DomainError } from "@/shared/lib/errors";

import {
  permissionModule,
  roleHasPermission,
  type MemberRole,
  type Permission,
} from "@/modules/registry";

import type { Db } from "../db/context";
import { withContext } from "../db/context";

/** Utilisateur authentifié (session web, ou utilisateur d'une opération synchronisée). */
export type Actor = {
  userId: string;
  isOwner: boolean;
  /** Le propriétaire doit avoir passé la double authentification. */
  isElevated: boolean;
};

export type EstablishmentAccess = {
  establishmentId: string;
  role: MemberRole | "owner";
  /** Contexte RLS à poser pour la suite de la requête. */
  dbContext: { establishmentId: string; isOwner: boolean };
};

/**
 * Contrôle d'accès unique (CLAUDE.md § 5.3), dans cet ordre :
 * 1. session valide ; 2. établissement actif ; 3. appartenance ;
 * 4. module actif ; 5. permission du rôle ; 6. propriété de la ressource.
 * La RLS de PostgreSQL reste un second rempart, jamais un substitut.
 */
export async function authorize(
  db: Db,
  actor: Actor | null,
  permission: Permission,
  target: { establishmentId: string; resourceOwnerId?: string | null; ownOnly?: boolean },
): Promise<EstablishmentAccess> {
  // 1. Session valide (et double authentification pour le propriétaire).
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Connectez-vous pour continuer.");
  if (actor.isOwner && !actor.isElevated) {
    throw new DomainError("MFA_REQUIRED", "Confirmez la double authentification pour continuer.");
  }

  // 2. Établissement existant et actif (EF-ETB-03).
  const establishment = await db.establishment.findUnique({
    where: { id: target.establishmentId },
    select: { id: true, status: true },
  });
  if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
  if (establishment.status !== "active") {
    throw new DomainError("ESTABLISHMENT_SUSPENDED", "Cet établissement est suspendu.");
  }

  // 3. Appartenance (le propriétaire accède à tous les établissements, EF-PRO-06).
  let role: MemberRole | "owner";
  if (actor.isOwner) {
    role = "owner";
  } else {
    const membership = await db.membership.findUnique({
      where: {
        userId_establishmentId: { userId: actor.userId, establishmentId: establishment.id },
      },
      include: { user: { select: { status: true } } },
    });
    if (!membership || membership.status !== "active" || membership.user.status !== "active") {
      throw new DomainError("NOT_A_MEMBER", "Vous n'avez pas accès à cet établissement.");
    }
    role = membership.role;
  }

  // 4. Module actif (EF-MOD-02, RG-MOD-01). Le noyau ne se désactive pas.
  const moduleId = permissionModule(permission);
  if (moduleId !== "core") {
    // establishment_modules est protégée par la RLS : lecture dans le contexte de l'établissement.
    const activation = await withContext(
      db,
      { establishmentId: establishment.id, isOwner: false },
      (tx) =>
        tx.establishmentModule.findUnique({
          where: {
            establishmentId_module: { establishmentId: establishment.id, module: moduleId },
          },
        }),
    );
    if (!activation?.enabled) {
      throw new DomainError("MODULE_DISABLED", "Cette fonctionnalité n'est pas activée ici.");
    }
  }

  // 5. Permission du rôle (matrice des droits).
  if (!roleHasPermission(role, permission)) {
    throw new DomainError("FORBIDDEN", "Votre rôle ne permet pas cette action.");
  }

  // 6. Propriété de la ressource, quand l'action est limitée à « les siennes » (RG-CMD-03).
  if (
    target.ownOnly &&
    role !== "owner" &&
    role !== "manager" &&
    target.resourceOwnerId !== undefined &&
    target.resourceOwnerId !== actor.userId
  ) {
    throw new DomainError("NOT_OWNER", "Cette ressource appartient à un autre utilisateur.");
  }

  return {
    establishmentId: establishment.id,
    role,
    dbContext: { establishmentId: establishment.id, isOwner: actor.isOwner },
  };
}

/**
 * Actions réservées au propriétaire, hors d'un établissement précis
 * (création, vue d'ensemble) : rôle propriétaire et double authentification.
 */
export function requireOwner(actor: Actor | null): Actor {
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Connectez-vous pour continuer.");
  if (!actor.isOwner) throw new DomainError("FORBIDDEN", "Réservé au propriétaire.");
  if (!actor.isElevated) {
    throw new DomainError("MFA_REQUIRED", "Confirmez la double authentification pour continuer.");
  }
  return actor;
}
