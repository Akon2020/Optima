import { DomainError } from "@/shared/lib/errors";

import { logger } from "./logger";

/** Résultat discriminé des Server Actions (CLAUDE.md § 3.10). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

export function newCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Transforme une erreur en résultat sûr pour le client : message métier pour
 * une DomainError, sinon message générique et identifiant de corrélation.
 * Aucune trace, requête ni chemin n'est renvoyé (§ 5.9).
 */
export function toActionError(error: unknown): Extract<ActionResult, { ok: false }> {
  if (error instanceof DomainError) {
    return { ok: false, code: error.code, message: error.message };
  }
  const correlationId = newCorrelationId();
  logger.error({ err: error, correlationId }, "Erreur inattendue");
  return {
    ok: false,
    code: "UNEXPECTED",
    message: `Une erreur inattendue est survenue. Réessayez ; si elle persiste, communiquez ce code : ${correlationId}.`,
  };
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return toActionError(error);
  }
}
