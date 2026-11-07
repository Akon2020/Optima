import "server-only";

import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { DomainError } from "@/shared/lib/errors";

import type { Actor } from "@/server/authz/authorize";
import { getCurrentSession } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";

/**
 * Contexte commun des écrans de gestion en ligne (équipe, appareils) :
 * session web valide, mot de passe définitif, double authentification du
 * propriétaire, établissement existant. Les droits sont ensuite vérifiés par
 * `authorize` dans chaque service (CLAUDE.md § 3.3 et § 5.3).
 */
export async function managementContext(slug: string) {
  // Écrans propres à chaque requête (session, heure) : jamais prérendus.
  await connection();
  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  if (session.user.mustChangePassword) redirect("/connexion/nouveau-mot-de-passe");
  if (session.user.isOwner && !session.user.totpEnabledAt) redirect("/connexion/activer-2fa");
  if (session.user.isOwner && !session.isElevated) redirect("/connexion/double-authentification");

  const db = getPrisma();
  const establishment = await db.establishment.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!establishment) notFound();

  const actor: Actor = {
    userId: session.user.id,
    isOwner: session.user.isOwner,
    isElevated: session.isElevated,
  };
  return {
    db,
    actor,
    establishment,
    backHref: session.user.isOwner ? "/proprietaire" : "/compte",
  };
}

/** Exécute une lecture protégée ; un refus métier devient un message affichable. */
export async function guarded<T>(
  fn: () => Promise<T>,
): Promise<{ data: T; denied: null } | { data: null; denied: string }> {
  try {
    return { data: await fn(), denied: null };
  } catch (error) {
    if (error instanceof DomainError) return { data: null, denied: error.message };
    throw error;
  }
}
