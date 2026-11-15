import { DomainError } from "@/shared/lib/errors";

import { getPrisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { deviceFromRequest } from "@/server/sync/device-request";
import { pullChanges } from "@/server/sync/pull";

/** GET /api/sync/pull?cursor=... : changements de l'établissement depuis un curseur. */
export async function GET(request: Request): Promise<Response> {
  // L'en-tête est lu en premier : c'est lui qui marque la requête comme
  // dynamique (aucun prérendu au build, Cache Components).
  const authorization = request.headers.get("authorization");
  const db = getPrisma();
  const { device, response } = await deviceFromRequest(db, authorization);
  if (response) return response;
  try {
    const cursor = new URL(request.url).searchParams.get("cursor");
    return Response.json(
      await pullChanges(db, device, cursor, undefined, pendingFromHeader(request)),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
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

/** RG-CLO-03 : en-tête `X-Pending-Operations` envoyé par l'appareil (entier borné). */
function pendingFromHeader(request: Request): number | undefined {
  const value = request.headers.get("x-pending-operations");
  if (value === null || !/^\d{1,6}$/.test(value)) return undefined;
  return Number(value);
}
