"use server";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { getCurrentSession, requestMeta } from "@/server/auth/current";
import { getPrisma } from "@/server/db/client";
import { runAction, type ActionResult } from "@/server/errors";
import { revokeDevice } from "@/server/sync/devices";

const revokeSchema = z.object({
  slug: z.string().min(1).max(80),
  deviceId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Indiquez le motif de la révocation.")
    .max(200, "Le motif tient en 200 caractères au plus."),
});

/**
 * Révocation d'un appareil perdu, volé ou remplacé (EF-CPT-04). Effet
 * immédiat : l'appareil ne peut plus ni envoyer ni recevoir, et il efface ses
 * données locales à sa prochaine connexion (ENF-09). Action auditée.
 */
export async function revokeDeviceAction(input: {
  slug: string;
  deviceId: string;
  reason: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = revokeSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
    }
    const session = await getCurrentSession();
    if (!session)
      throw new DomainError("UNAUTHENTICATED", "Votre session a expiré : reconnectez-vous.");
    const db = getPrisma();
    const establishment = await db.establishment.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    });
    if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
    await revokeDevice(
      db,
      { userId: session.user.id, isOwner: session.user.isOwner, isElevated: session.isElevated },
      {
        establishmentId: establishment.id,
        deviceId: parsed.data.deviceId,
        reason: parsed.data.reason,
      },
      { ip: (await requestMeta()).ip },
    );
    return undefined;
  });
}
