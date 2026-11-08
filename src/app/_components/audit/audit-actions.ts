"use server";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { getCurrentSession, requestMeta } from "@/server/auth/current";
import { exportAuditCsv } from "@/server/audit/journal";
import { getPrisma } from "@/server/db/client";
import { runAction, type ActionResult } from "@/server/errors";

const filtersSchema = z.object({
  domain: z.string().max(40).nullable(),
  action: z.string().max(80).nullable(),
  actorUserId: z.string().max(40).nullable(),
  deviceId: z.string().max(40).nullable(),
  from: z.string().max(10).nullable(),
  to: z.string().max(10).nullable(),
});

const inputSchema = z.object({
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("establishment"), slug: z.string().min(1).max(80) }),
    z.object({ kind: z.literal("owner"), establishmentId: z.string().max(40).nullable() }),
  ]),
  filters: filtersSchema,
});

export type AuditExportInput = z.input<typeof inputSchema>;

/**
 * Export CSV du journal (EF-AUD-04). Server Action (POST) et non lien GET :
 * l'export est lui-même inscrit au journal, et aucune modification ne passe
 * par GET (CLAUDE.md § 5.4). Les droits sont revérifiés par le service.
 */
export async function exportAuditAction(
  input: AuditExportInput,
): Promise<ActionResult<{ filename: string; csv: string; count: number }>> {
  return runAction(async () => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new DomainError("INVALID_INPUT", "Filtres invalides.");
    const session = await getCurrentSession();
    if (!session) {
      throw new DomainError("UNAUTHENTICATED", "Votre session a expiré : reconnectez-vous.");
    }
    const db = getPrisma();
    const actor = {
      userId: session.user.id,
      isOwner: session.user.isOwner,
      isElevated: session.isElevated,
    };
    let scope: Parameters<typeof exportAuditCsv>[2]["scope"];
    if (parsed.data.scope.kind === "establishment") {
      const establishment = await db.establishment.findUnique({
        where: { slug: parsed.data.scope.slug },
        select: { id: true },
      });
      if (!establishment) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
      scope = { kind: "establishment", establishmentId: establishment.id };
    } else {
      scope = { kind: "owner", establishmentId: parsed.data.scope.establishmentId };
    }
    return exportAuditCsv(
      db,
      actor,
      { scope, filters: parsed.data.filters },
      { ip: (await requestMeta()).ip },
    );
  });
}
