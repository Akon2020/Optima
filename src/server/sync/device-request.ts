import { SYNC_RATE_LIMIT, isRateLimited } from "../rate-limit";
import type { Db } from "../db/context";
import { resolveDevice, type AuthenticatedDevice } from "./devices";

/**
 * Contrôles communs des routes de synchronisation : jeton d'appareil, état de
 * l'établissement, limitation de débit (CLAUDE.md § 5.6).
 *
 * - 401 : appareil inconnu ou révoqué ; l'appareil efface ses données (ENF-09).
 * - 403 : établissement suspendu (EF-ETB-03) ; l'appareil garde tout et attend.
 */
export async function deviceFromRequest(
  db: Db,
  authorization: string | null,
): Promise<{ device: AuthenticatedDevice; response: null } | { device: null; response: Response }> {
  const result = await resolveDevice(db, authorization);
  if (result.status === "unknown") {
    return {
      device: null,
      response: Response.json(
        { code: "DEVICE_UNAUTHORIZED", message: "Appareil inconnu ou révoqué : reconnectez-le." },
        { status: 401 },
      ),
    };
  }
  if (result.status === "suspended") {
    return {
      device: null,
      response: Response.json(
        {
          code: "ESTABLISHMENT_SUSPENDED",
          message:
            "Établissement suspendu par le propriétaire : les opérations restent sur l'appareil et partiront à sa réactivation.",
        },
        { status: 403 },
      ),
    };
  }
  const { device } = result;
  if (isRateLimited(`sync:${device.id}`, SYNC_RATE_LIMIT.limit, SYNC_RATE_LIMIT.windowMs)) {
    return {
      device: null,
      response: Response.json(
        { code: "RATE_LIMITED", message: "Trop de requêtes : nouvel essai dans une minute." },
        { status: 429 },
      ),
    };
  }
  return { device, response: null };
}
