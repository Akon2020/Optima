"use server";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { requestMeta, getCurrentSession } from "@/server/auth/current";
import { verifyDeviceUser, type DeviceUser } from "@/server/auth/device-users";
import { getPrisma } from "@/server/db/client";
import { runAction, type ActionResult } from "@/server/errors";
import { authenticateDevice, registerDevice } from "@/server/sync/devices";

/**
 * Actions en ligne du module Restaurant sur un appareil (RG-OFF-02 : elles
 * exigent le réseau). Les écritures métier, elles, passent par la file de
 * synchronisation.
 */

export type PairingResult = {
  deviceId: string;
  code: string;
  token: string;
  establishmentId: string;
  /** Le gérant qui appaire devient le premier utilisateur de l'appareil. */
  user: DeviceUser | null;
};

const pairSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(2, "Donnez un nom à cet appareil.").max(60),
});

/**
 * Appairage d'un appareil (EF-CPT-04) par un gérant connecté sur ce
 * navigateur. Le secret de l'appareil n'est renvoyé qu'ici, une seule fois.
 */
export async function pairDeviceAction(input: {
  slug: string;
  name: string;
}): Promise<ActionResult<PairingResult>> {
  return runAction(async () => {
    const parsed = pairSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
    }
    const session = await getCurrentSession();
    if (!session) {
      throw new DomainError(
        "UNAUTHENTICATED",
        "Connectez-vous d'abord avec un compte de gérant sur ce navigateur.",
      );
    }
    const db = getPrisma();
    const establishment = await db.establishment.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    });
    if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");

    const actor = {
      userId: session.user.id,
      isOwner: session.user.isOwner,
      isElevated: session.isElevated,
    };
    const registered = await registerDevice(
      db,
      actor,
      { establishmentId: establishment.id, name: parsed.data.name },
      { ip: (await requestMeta()).ip },
    );
    const membership = session.user.isOwner
      ? null
      : await db.membership.findUnique({
          where: {
            userId_establishmentId: { userId: session.user.id, establishmentId: establishment.id },
          },
        });
    return {
      ...registered,
      establishmentId: establishment.id,
      user: membership
        ? { userId: session.user.id, name: session.user.displayName, role: membership.role }
        : null,
    };
  });
}

/** Connexion d'un membre sur l'appareil, avant le choix de son code PIN. */
export async function linkDeviceUserAction(input: {
  deviceToken: string;
  identifier: string;
  password: string;
}): Promise<ActionResult<DeviceUser>> {
  return runAction(async () => {
    const db = getPrisma();
    const device = await authenticateDevice(db, `Device ${input.deviceToken}`);
    if (!device) {
      throw new DomainError("DEVICE_UNAUTHORIZED", "Appareil inconnu ou révoqué : reconnectez-le.");
    }
    return verifyDeviceUser(
      db,
      device,
      { identifier: input.identifier, password: input.password },
      { ip: (await requestMeta()).ip },
    );
  });
}
