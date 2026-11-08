import { ZodError } from "zod";

import { DomainError } from "@/shared/lib/errors";
import type { Currency } from "@/shared/lib/money";

import {
  MAX_OPERATIONS_PER_PUSH,
  operationEnvelopeSchema,
  type OperationEnvelope,
} from "@/modules/restaurant/schemas/sync";

import { authorize } from "../authz/authorize";
import type { Db } from "../db/context";
import { toJson, withContext } from "../db/context";
import { logger } from "../logger";
import { touchDevice, type AuthenticatedDevice } from "./devices";
import { RESTAURANT_HANDLERS, type OperationHandler } from "./restaurant-handlers";

/**
 * Réception des opérations (POST /api/sync/push, CLAUDE.md § 3.6).
 * Chaque opération est traitée dans sa propre transaction et reçoit une
 * réponse visible (EF-OFF-04) :
 * - `accepted` : appliquée ;
 * - `duplicate` : déjà reçue, rien n'est compté deux fois (RG-OFF-01) ;
 * - `rejected` : refusée avec un code et un message en français, conservée
 *   pour revue (un utilisateur suspendu entre-temps ne perd rien) ;
 * - `retry` : erreur inattendue du serveur, l'appareil réessaiera.
 */
export type OperationResult =
  | { id: string; status: "accepted" | "duplicate" }
  | { id: string; status: "rejected"; code: string; message: string }
  | { id: string; status: "retry"; message: string };

const HANDLERS: Record<string, OperationHandler> = { ...RESTAURANT_HANDLERS };

export async function pushOperations(
  db: Db,
  device: AuthenticatedDevice,
  rawOperations: unknown,
  now: Date = new Date(),
): Promise<OperationResult[]> {
  if (!Array.isArray(rawOperations)) {
    throw new DomainError("INVALID_BATCH", "Le lot d'opérations est invalide.");
  }
  if (rawOperations.length > MAX_OPERATIONS_PER_PUSH) {
    throw new DomainError(
      "BATCH_TOO_LARGE",
      `Un lot contient au plus ${MAX_OPERATIONS_PER_PUSH} opérations.`,
    );
  }
  const results: OperationResult[] = [];
  for (const raw of rawOperations) {
    results.push(await processOperation(db, device, raw, now));
  }
  await touchDevice(db, device.id, now);
  return results;
}

async function storeRejection(
  db: Db,
  device: AuthenticatedDevice,
  operation: OperationEnvelope,
  code: string,
  message: string,
): Promise<OperationResult> {
  try {
    await withContext(db, { establishmentId: device.establishmentId, isOwner: false }, (tx) =>
      tx.syncOperation.create({
        data: {
          id: operation.id,
          establishmentId: device.establishmentId,
          deviceId: device.id,
          userId: isUuid(operation.userId) ? operation.userId : device.id,
          type: operation.type,
          payload: toJson(operation.payload ?? null),
          schemaVersion: operation.schemaVersion,
          status: "rejected",
          rejectionCode: code,
          rejectionMessage: message,
          clientCreatedAt: new Date(operation.createdAt),
        },
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { id: operation.id, status: "duplicate" };
    throw error;
  }
  return { id: operation.id, status: "rejected", code, message };
}

async function processOperation(
  db: Db,
  device: AuthenticatedDevice,
  raw: unknown,
  now: Date,
): Promise<OperationResult> {
  const envelope = operationEnvelopeSchema.safeParse(raw);
  const rawId = (raw as { id?: unknown } | null)?.id;
  if (!envelope.success) {
    return {
      id: typeof rawId === "string" ? rawId : "",
      status: "rejected",
      code: "INVALID_OPERATION",
      message: "Opération mal formée.",
    };
  }
  const operation = envelope.data;

  try {
    const existing = await withContext(
      db,
      { establishmentId: device.establishmentId, isOwner: false },
      (tx) => tx.syncOperation.findUnique({ where: { id: operation.id }, select: { id: true } }),
    );
    if (existing) return { id: operation.id, status: "duplicate" };

    if (operation.establishmentId !== device.establishmentId || operation.deviceId !== device.id) {
      return storeRejection(
        db,
        device,
        operation,
        "DEVICE_MISMATCH",
        "Opération d'un autre appareil ou établissement.",
      );
    }
    const handler = HANDLERS[operation.type];
    if (!handler) {
      return storeRejection(
        db,
        device,
        operation,
        "UNKNOWN_OPERATION",
        "Type d'opération inconnu du serveur.",
      );
    }

    // Revalidation au moment de l'envoi (CLAUDE.md § 5.1) : droits actuels de l'utilisateur.
    const user = isUuid(operation.userId)
      ? await db.user.findUnique({
          where: { id: operation.userId },
          select: { id: true, isOwner: true, status: true },
        })
      : null;
    if (!user || user.status !== "active") {
      return storeRejection(
        db,
        device,
        operation,
        "USER_NOT_ALLOWED",
        "Utilisateur inconnu ou suspendu : opération à revoir par le gérant.",
      );
    }
    const access = await authorize(
      db,
      { userId: user.id, isOwner: user.isOwner, isElevated: true },
      handler.permission,
      { establishmentId: device.establishmentId },
    );
    const payload = handler.schema.parse(operation.payload);

    await withContext(db, access.dbContext, async (tx) => {
      await handler.apply(
        tx,
        {
          establishmentId: device.establishmentId,
          deviceId: device.id,
          deviceCode: device.code,
          userId: user.id,
          role: access.role,
          currency: device.currency as Currency,
          receivedAt: now,
        },
        payload,
      );
      await tx.syncOperation.create({
        data: {
          id: operation.id,
          establishmentId: device.establishmentId,
          deviceId: device.id,
          userId: user.id,
          type: operation.type,
          payload: toJson(operation.payload),
          schemaVersion: operation.schemaVersion,
          status: "accepted",
          clientCreatedAt: new Date(operation.createdAt),
          receivedAt: now,
        },
      });
    });
    return { id: operation.id, status: "accepted" };
  } catch (error) {
    // RG-MOD-01 : désactiver un module n'efface rien. Une opération d'un module
    // désactivé n'est donc pas refusée pour de bon : elle reste sur l'appareil
    // et partira à la réactivation.
    if (error instanceof DomainError && error.code === "MODULE_DISABLED") {
      return {
        id: operation.id,
        status: "retry",
        message: "Module désactivé par le propriétaire : l'opération attend sa réactivation.",
      };
    }
    if (error instanceof DomainError) {
      return storeRejection(db, device, operation, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return storeRejection(
        db,
        device,
        operation,
        "INVALID_PAYLOAD",
        "Contenu de l'opération invalide.",
      );
    }
    if (isUniqueViolation(error)) {
      // Opération envoyée deux fois en parallèle, ou numéro de document déjà utilisé.
      const isSameOperation = String((error as { meta?: unknown }).meta ?? "").includes(
        "sync_operations",
      );
      return isSameOperation
        ? { id: operation.id, status: "duplicate" }
        : storeRejection(
            db,
            device,
            operation,
            "DUPLICATE_DOCUMENT",
            "Un numéro ou un identifiant existe déjà (RG-DOC-01).",
          );
    }
    logger.error(
      { err: error, operationId: operation.id, type: operation.type },
      "Échec d'une opération synchronisée",
    );
    return {
      id: operation.id,
      status: "retry",
      message: "Erreur temporaire du serveur : nouvel essai automatique.",
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}
