import "server-only";

import { DomainError } from "@/shared/lib/errors";

import type { Actor } from "@/server/authz/authorize";
import { getCurrentSession, requestMeta } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";

/**
 * Contexte d'une Server Action de gestion : acteur de la session web,
 * établissement relu par son identifiant public, adresse IP pour l'audit.
 * L'établissement envoyé par le client n'est jamais cru tel quel (§ 3.9).
 */
export async function actionContext(slug: string) {
  const session = await getCurrentSession();
  if (!session) {
    throw new DomainError("UNAUTHENTICATED", "Votre session a expiré : reconnectez-vous.");
  }
  const db = getPrisma();
  const establishment = await db.establishment.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
  const actor: Actor = {
    userId: session.user.id,
    isOwner: session.user.isOwner,
    isElevated: session.isElevated,
  };
  return { db, actor, establishmentId: establishment.id, ip: (await requestMeta()).ip };
}
