"use server";

import { z } from "zod";

import { DomainError } from "@/shared/lib/errors";

import type { CreateEstablishmentInput, IdentityInput } from "@/modules/owner";
import { runAction, type ActionResult } from "@/server/errors";
import {
  createEstablishment,
  reactivateEstablishment,
  setModuleEnabled,
  suspendEstablishment,
  updateEstablishmentIdentity,
} from "@/server/owner/establishments";

import { ownerActionContext } from "../_lib/owner";

/**
 * Actions de l'espace propriétaire sur les établissements. Les schémas
 * complets sont appliqués par les services ; ici, seul l'identifiant ciblé
 * est contrôlé.
 */
const id = z.uuid("Établissement introuvable.");

function parseId(value: unknown): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new DomainError("NOT_FOUND", "Établissement introuvable.");
  return parsed.data;
}

export async function createEstablishmentAction(
  input: CreateEstablishmentInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { db, actor, ip } = await ownerActionContext();
    const created = await createEstablishment(db, actor, input, { ip });
    return { id: created.id };
  });
}

export async function updateIdentityAction(
  input: { establishmentId: string } & IdentityInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const { db, actor, ip } = await ownerActionContext();
    await updateEstablishmentIdentity(
      db,
      actor,
      { ...input, establishmentId: parseId(input.establishmentId) },
      { ip },
    );
    return undefined;
  });
}

export async function setModuleAction(input: {
  establishmentId: string;
  module: string;
  enabled: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { db, actor, ip } = await ownerActionContext();
    await setModuleEnabled(
      db,
      actor,
      {
        establishmentId: parseId(input.establishmentId),
        module: String(input.module),
        enabled: input.enabled === true,
      },
      { ip },
    );
    return undefined;
  });
}

export async function suspendEstablishmentAction(input: {
  establishmentId: string;
  reason: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { db, actor, ip } = await ownerActionContext();
    await suspendEstablishment(
      db,
      actor,
      { establishmentId: parseId(input.establishmentId), reason: String(input.reason ?? "") },
      { ip },
    );
    return undefined;
  });
}

export async function reactivateEstablishmentAction(input: {
  establishmentId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { db, actor, ip } = await ownerActionContext();
    await reactivateEstablishment(
      db,
      actor,
      { establishmentId: parseId(input.establishmentId) },
      { ip },
    );
    return undefined;
  });
}
