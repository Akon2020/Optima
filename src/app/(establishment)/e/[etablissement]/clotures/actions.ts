"use server";

import "@/shared/lib/zod-config";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { runAction, type ActionResult } from "@/server/errors";
import { recordClosingAdjustment, validatePeriod } from "@/server/restaurant/periods";

import { actionContext } from "../_lib/actions";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une journée.");
const reason = z
  .string()
  .trim()
  .min(3, "Indiquez le motif de la correction (3 caractères au moins).")
  .max(200, "Le motif tient en 200 caractères au plus.");

const adjustmentSchema = z.object({
  slug: z.string().min(1).max(80),
  adjustment: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cash"),
      day,
      userId: z.uuid("Choisissez la personne."),
      amountMajor: z
        .number({ message: "Indiquez un montant." })
        .int("Le montant se compte en francs entiers.")
        .refine((value) => value !== 0, "Indiquez un montant non nul.")
        .refine((value) => Math.abs(value) <= 100_000_000, "Ce montant semble trop élevé."),
      reason,
    }),
    z.object({
      kind: z.literal("stock"),
      day,
      servicePointId: z.uuid(),
      menuItemId: z.uuid("Choisissez l'élément."),
      quantity: z
        .number({ message: "Indiquez une quantité." })
        .int("La quantité est un nombre entier.")
        .refine((value) => value !== 0, "Indiquez une quantité non nulle.")
        .refine((value) => Math.abs(value) <= 100_000, "Cette quantité semble trop élevée."),
      reason,
    }),
  ]),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
  }
  return parsed.data;
}

/** RG-CLO-02 : écriture d'ajustement datée et motivée sur une journée validée (D-064). */
export async function recordAdjustmentAction(
  input: z.input<typeof adjustmentSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parse(adjustmentSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    await recordClosingAdjustment(
      db,
      actor,
      { establishmentId, adjustment: data.adjustment },
      { ip },
    );
    revalidatePath(`/e/${data.slug}/clotures`);
    return undefined;
  });
}

const periodSchema = z.object({
  slug: z.string().min(1).max(80),
  from: day,
  to: day,
  comment: z.string().trim().max(300, "Le commentaire tient en 300 caractères au plus."),
});

/** EF-CLO-05 : validation d'une période par le gérant ; le résumé est figé (D-064). */
export async function validatePeriodAction(
  input: z.input<typeof periodSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parse(periodSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    await validatePeriod(
      db,
      actor,
      { establishmentId, from: data.from, to: data.to, comment: data.comment },
      { ip },
    );
    revalidatePath(`/e/${data.slug}/clotures`);
    return undefined;
  });
}
