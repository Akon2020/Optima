"use server";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import { runAction, type ActionResult } from "@/server/errors";
import {
  createStaffMember,
  reactivateStaffMember,
  resetStaffPassword,
  signOutStaffMember,
  suspendStaffMember,
  updateStaffMember,
} from "@/server/staff/staff";

import { actionContext } from "../_lib/actions";

/**
 * Actions de l'écran « Équipe » (EF-CPT-01 à 05, EF-AUT-02, EF-AUT-04).
 * Schémas Zod ici pour le retour immédiat ; les règles (qui gère qui, rôles
 * attribuables, poste obligatoire) sont revérifiées par le service.
 */

const ROLE = z.enum(["manager", "waiter", "prep", "courier", "reader"]);
const base = { slug: z.string().min(1).max(80) };
const target = { ...base, userId: z.uuid() };
const name = z
  .string()
  .trim()
  .min(2, "Le nom compte au moins 2 caractères.")
  .max(60, "Le nom compte au plus 60 caractères.");

const createSchema = z.object({
  ...base,
  name,
  identifier: z.string().trim().min(3, "Saisissez une adresse e-mail ou un numéro.").max(120),
  role: ROLE,
  servicePointId: z.uuid().nullable(),
});
const updateSchema = z.object({ ...target, name, role: ROLE, servicePointId: z.uuid().nullable() });
const suspendSchema = z.object({
  ...target,
  reason: z
    .string()
    .trim()
    .min(3, "Indiquez le motif de la suspension.")
    .max(200, "Le motif tient en 200 caractères au plus."),
});
const targetSchema = z.object(target);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Saisie invalide.");
  }
  return parsed.data;
}

export async function createStaffAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const data = parse(createSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    const result = await createStaffMember(
      db,
      actor,
      {
        establishmentId,
        name: data.name,
        identifier: data.identifier,
        role: data.role,
        servicePointId: data.servicePointId,
      },
      { ip },
    );
    return { temporaryPassword: result.temporaryPassword };
  });
}

export async function updateStaffAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parse(updateSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    await updateStaffMember(
      db,
      actor,
      {
        establishmentId,
        userId: data.userId,
        name: data.name,
        role: data.role,
        servicePointId: data.servicePointId,
      },
      { ip },
    );
    return undefined;
  });
}

export async function resetStaffPasswordAction(
  input: z.input<typeof targetSchema>,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const data = parse(targetSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    return resetStaffPassword(db, actor, { establishmentId, userId: data.userId }, { ip });
  });
}

export async function suspendStaffAction(
  input: z.input<typeof suspendSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parse(suspendSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    await suspendStaffMember(
      db,
      actor,
      { establishmentId, userId: data.userId, reason: data.reason },
      { ip },
    );
    return undefined;
  });
}

export async function reactivateStaffAction(
  input: z.input<typeof targetSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parse(targetSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    await reactivateStaffMember(db, actor, { establishmentId, userId: data.userId }, { ip });
    return undefined;
  });
}

export async function signOutStaffAction(
  input: z.input<typeof targetSchema>,
): Promise<ActionResult<{ sessions: number }>> {
  return runAction(async () => {
    const data = parse(targetSchema, input);
    const { db, actor, establishmentId, ip } = await actionContext(data.slug);
    return signOutStaffMember(db, actor, { establishmentId, userId: data.userId }, { ip });
  });
}
