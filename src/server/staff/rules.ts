import type { MemberRole } from "@/modules/registry";

/**
 * Règles de gestion du personnel (EF-CPT-01, EF-CPT-03, matrice des droits,
 * docs/SPECIFICATIONS.md § 3). Fonctions pures, sans accès à la base.
 *
 * - Le propriétaire gère tous les comptes, gérants compris (EF-CPT-01).
 * - Le gérant gère le personnel de son établissement, mais ni les gérants ni
 *   lui-même : il ne peut pas attribuer un droit qu'il n'a pas (EF-CPT-03).
 */
export type StaffActorRole = MemberRole | "owner";

export const STAFF_ROLES: readonly MemberRole[] = [
  "manager",
  "waiter",
  "prep",
  "courier",
  "reader",
];

export const STAFF_ROLE_LABELS: Record<MemberRole, string> = {
  manager: "Gérant",
  waiter: "Serveur",
  prep: "Poste de préparation",
  courier: "Livreur",
  reader: "Lecteur",
};

/** Rôles qu'un acteur peut attribuer. */
export function assignableRoles(actor: StaffActorRole): MemberRole[] {
  if (actor === "owner") return [...STAFF_ROLES];
  if (actor === "manager") return STAFF_ROLES.filter((role) => role !== "manager");
  return [];
}

/** Un acteur peut-il agir sur ce compte (modifier, réinitialiser, suspendre) ? */
export function canManageMember(
  actor: { role: StaffActorRole; userId: string },
  target: { role: MemberRole; userId: string },
): boolean {
  if (actor.userId === target.userId) return false;
  return assignableRoles(actor.role).includes(target.role);
}

/** Un poste de préparation est rattaché à un point de service ; les autres rôles non. */
export function requiresServicePoint(role: MemberRole): boolean {
  return role === "prep";
}
