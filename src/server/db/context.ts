import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export type DbContext = {
  /** Établissement du contexte ; `null` pour les opérations sans établissement. */
  establishmentId: string | null;
  /** Vrai seulement après vérification du rôle propriétaire par `authorize`. */
  isOwner: boolean;
};

/**
 * Exécute `fn` dans une transaction qui pose d'abord le contexte de sécurité
 * (SET LOCAL via set_config(..., true), CLAUDE.md § 3.8). La RLS de
 * PostgreSQL filtre alors toutes les requêtes de la transaction.
 */
export async function withContext<T>(
  db: Db,
  context: DbContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.establishment_id', ${context.establishmentId ?? ""}, true),
      set_config('app.is_owner', ${context.isOwner ? "true" : "false"}, true)`;
    return fn(tx);
  });
}

/** Convertit un BIGINT de montant en nombre, en refusant toute perte de précision. */
export function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`Montant hors limites : ${value}.`);
  return number;
}

/** Sérialise une entité pour le journal des changements (BigInt en texte). */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, inner: unknown) =>
      typeof inner === "bigint" ? inner.toString() : inner,
    ),
  ) as Prisma.InputJsonValue;
}
