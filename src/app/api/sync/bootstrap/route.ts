import { getPrisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { SYNC_RATE_LIMIT, isRateLimited } from "@/server/rate-limit";
import { buildBootstrap } from "@/server/sync/bootstrap";
import { authenticateDevice } from "@/server/sync/devices";

/** GET /api/sync/bootstrap : état initial d'un appareil appairé. */
export async function GET(request: Request): Promise<Response> {
  // L'en-tête est lu en premier : la requête est dynamique (aucun prérendu).
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
    return Response.json(await buildBootstrap(db, device), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const correlationId = crypto.randomUUID().slice(0, 8);
    logger.error(
      { err: error, correlationId, deviceId: device.id },
      "Échec de /api/sync/bootstrap",
    );
    return Response.json(
      { code: "UNEXPECTED", message: `Erreur du serveur (code ${correlationId}).` },
      { status: 500 },
    );
  }
}
