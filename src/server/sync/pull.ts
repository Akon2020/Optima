import { DomainError } from "@/shared/lib/errors";

import type { Db } from "../db/context";
import { withContext } from "../db/context";
import { touchDevice, type AuthenticatedDevice } from "./devices";

/**
 * Diffusion des changements (GET /api/sync/pull?cursor=..., CLAUDE.md § 3.6) :
 * les changements de l'établissement de l'appareil depuis un curseur monotone.
 */
export const MAX_CHANGES_PER_PULL = 500;

export type PulledChange = {
  seq: string;
  entity: string;
  entityId: string;
  data: unknown;
  createdAt: string;
};

export async function pullChanges(
  db: Db,
  device: AuthenticatedDevice,
  cursorParam: string | null,
  limit = MAX_CHANGES_PER_PULL,
): Promise<{ changes: PulledChange[]; cursor: string; hasMore: boolean }> {
  const cursor = cursorParam === null || cursorParam === "" ? "0" : cursorParam;
  if (!/^\d{1,19}$/.test(cursor)) throw new DomainError("INVALID_CURSOR", "Curseur invalide.");
  const take = Math.min(Math.max(limit, 1), MAX_CHANGES_PER_PULL);

  const rows = await withContext(
    db,
    { establishmentId: device.establishmentId, isOwner: false },
    (tx) =>
      tx.changeLog.findMany({
        where: { seq: { gt: BigInt(cursor) } },
        orderBy: { seq: "asc" },
        take: take + 1,
      }),
  );
  const page = rows.slice(0, take);
  // Dernier contact visible sur l'écran « Appareils », même sans opération à envoyer.
  await touchDevice(db, device.id);
  return {
    changes: page.map((row) => ({
      seq: row.seq.toString(),
      entity: row.entity,
      entityId: row.entityId,
      data: row.data,
      createdAt: row.createdAt.toISOString(),
    })),
    cursor: page.at(-1)?.seq.toString() ?? cursor,
    hasMore: rows.length > take,
  };
}
