/**
 * File d'opérations hors connexion (patron outbox, CLAUDE.md § 3.6).
 *
 * Toute écriture métier d'un écran hors connexion crée une opération,
 * appliquée localement puis envoyée au serveur. L'envoi (POST /api/sync/push)
 * sera branché avec le socle serveur (D-018) ; d'ici là, les opérations
 * restent « en attente » et sont visibles dans l'interface (EF-OFF-02).
 */

export type OutboxStatus = "pending" | "accepted" | "duplicate" | "rejected";

export type OutboxOperation = {
  /** UUIDv7 généré sur l'appareil : garantit l'idempotence (RG-OFF-01). */
  id: string;
  type: string;
  payload: unknown;
  establishmentId: string;
  userId: string;
  deviceId: string;
  createdAt: string;
  schemaVersion: number;
  status: OutboxStatus;
  rejection: { code: string; message: string } | null;
};

export function createOperation(input: {
  id: string;
  type: string;
  payload: unknown;
  establishmentId: string;
  userId: string;
  deviceId: string;
  createdAt: string;
  schemaVersion?: number;
}): OutboxOperation {
  return {
    schemaVersion: 1,
    ...input,
    status: "pending",
    rejection: null,
  };
}
