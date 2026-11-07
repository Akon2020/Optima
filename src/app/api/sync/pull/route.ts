import { DomainError } from "@/shared/lib/errors";

import { getPrisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { SYNC_RATE_LIMIT, isRateLimited } from "@/server/rate-limit";
import { authenticateDevice } from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";

/** GET /api/sync/pull?cursor=... : changements de l'établissement depuis un curseur. */
export async function GET(request: Request): Promise<Response> {
  // L'en-tête est lu en premier : c'est lui qui marque la requête comme
  // dynamique (aucun prérendu au build, Cache Components).
  const authorization = request.headers.get("authorization");
  const db = getPrisma();
  const device = await authenticateDevice(db, authorization);
  if (!device) {
    return Response.json(
      { code: "DEVICE_UNAUTHORIZED", message: "Appareil inconnu ou révoqué : reconnectez-le." },
      { status: 401 },
    );
  }
  if (isRateLimited(`sync:${device.id}`, SYNC_RATE_LIMIT.limit, SYNC_RATE_LIMIT.windowMs)) {
    return Response.json(
      { code: "RATE_LIMITED", message: "Trop de requêtes : nouvel essai dans une minute." },
      { status: 429 },
    );
  }
  try {
    const cursor = new URL(request.url).searchParams.get("cursor");
    return Response.json(await pullChanges(db, device, cursor), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ code: error.code, message: error.message }, { status: 400 });
    }
    const correlationId = crypto.randomUUID().slice(0, 8);
    logger.error({ err: error, correlationId, deviceId: device.id }, "Échec de /api/sync/pull");
    return Response.json(
      { code: "UNEXPECTED", message: `Erreur du serveur (code ${correlationId}).` },
      { status: 500 },
    );
  }
}
