import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { DomainError } from "@/shared/lib/errors";

import type { Actor } from "@/server/authz/authorize";
import { getCurrentSession, requestMeta } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";

/**
 * Accès aux pages de l'espace propriétaire (CLAUDE.md § 3.3) : session,
 * mot de passe définitif, double authentification activée et vérifiée.
 * Les services revérifient le rôle par `requireOwner`.
 */
export async function ownerPageContext() {
  // Pages propres à chaque requête (session, heure) : jamais prérendues.
  await connection();
  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  if (session.user.mustChangePassword) redirect("/connexion/nouveau-mot-de-passe");
  if (!session.user.isOwner) redirect("/compte");
  if (!session.user.totpEnabledAt) redirect("/connexion/activer-2fa");
  if (!session.isElevated) redirect("/connexion/double-authentification");
  const actor: Actor = { userId: session.user.id, isOwner: true, isElevated: true };
  return { db: getPrisma(), actor };
}

/** Contexte d'une Server Action du propriétaire, avec l'adresse IP pour l'audit. */
export async function ownerActionContext() {
  const session = await getCurrentSession();
  if (!session) {
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré : reconnectez-vous.");
  }
  const actor: Actor = {
    userId: session.user.id,
    isOwner: session.user.isOwner,
    isElevated: session.isElevated,
  };
  return { db: getPrisma(), actor, ip: (await requestMeta()).ip };
}
