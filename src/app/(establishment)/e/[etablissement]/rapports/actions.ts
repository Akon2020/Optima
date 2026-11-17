"use server";

import "@/shared/lib/zod-config";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { runAction, type ActionResult } from "@/server/errors";
import { REPORT_FORMATS, exportRestaurantReport } from "@/server/reports/restaurant-report";

import { actionContext } from "../_lib/actions";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une journée.");

const exportSchema = z.object({
  slug: z.string().min(1).max(80),
  from: day,
  to: day,
  format: z.enum(REPORT_FORMATS),
});

export type ReportExportInput = z.input<typeof exportSchema>;

/**
 * Export du rapport (EF-RAP-04) : Server Action (POST), car l'export est
 * inscrit au journal d'audit ; les droits sont revérifiés par le service.
 */
export async function exportReportAction(
  input: ReportExportInput,
): Promise<ActionResult<{ filename: string; mimeType: string; base64: string }>> {
  return runAction(async () => {
    const parsed = exportSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
    }
    const { db, actor, establishmentId, ip } = await actionContext(parsed.data.slug);
    return exportRestaurantReport(
      db,
      actor,
      {
        establishmentId,
        from: parsed.data.from,
        to: parsed.data.to,
        format: parsed.data.format,
      },
      { ip },
    );
  });
}
