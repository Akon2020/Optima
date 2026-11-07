import { DomainError } from "@/shared/lib/errors";

import { getPrisma } from "@/server/db/client";
import { logger } from "@/server/logger";
import { deviceFromRequest } from "@/server/sync/device-request";
import { pushOperations } from "@/server/sync/push";

/**
 * POST /api/sync/push : réception d'un lot d'opérations d'un appareil
 * (CLAUDE.md § 3.6). Authentification par jeton d'appareil, jamais par cookie :
 * la protection CSRF par en-tête Origin n'est donc pas nécessaire ici.
 */
export async function POST(request: Request): Promise<Response> {
  // L'en-tête est lu en premier : c'est lui qui marque la requête comme
  // dynamique (aucun prérendu au build, Cache Components).
  const authorization = request.headers.get("authorization");
  const db = getPrisma();
  const { device, response } = await deviceFromRequest(db, authorization);
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { code: "INVALID_JSON", message: "Corps de requête illisible." },
      { status: 400 },
    );
  }

  try {
    const results = await pushOperations(
      db,
      device,
      (body as { operations?: unknown })?.operations,
    );
    return Response.json({ results });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ code: error.code, message: error.message }, { status: 400 });
    }
    const correlationId = crypto.randomUUID().slice(0, 8);
    logger.error({ err: error, correlationId, deviceId: device.id }, "Échec de /api/sync/push");
    return Response.json(
      { code: "UNEXPECTED", message: `Erreur du serveur (code ${correlationId}).` },
      { status: 500 },
    );
  }
}
