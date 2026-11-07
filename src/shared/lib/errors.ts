/**
 * Erreur métier attendue (CLAUDE.md § 3.10) : un code stable et un message
 * en français, compréhensible, qui dit quoi faire.
 */
export class DomainError extends Error {
  override name = "DomainError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  return "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, prévenez le gérant.";
}
