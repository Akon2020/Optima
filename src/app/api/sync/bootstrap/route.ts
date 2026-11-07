import { getPrisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { buildBootstrap } from "@/server/sync/bootstrap";
import { deviceFromRequest } from "@/server/sync/device-request";

/** GET /api/sync/bootstrap : état initial d'un appareil appairé. */
export async function GET(request: Request): Promise<Response> {
  // L'en-tête est lu en premier : la requête est dynamique (aucun prérendu).
  const authorization = request.headers.get("authorization");
  const db = getPrisma();
  const { device, response } = await deviceFromRequest(db, authorization);
  if (response) return response;
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
