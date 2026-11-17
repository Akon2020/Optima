import "@/shared/lib/zod-config";

import { z } from "zod";

import { CURRENCIES } from "@/shared/lib/money";

import { ESTABLISHMENT_TYPES } from "@/modules/registry";

import { RESERVED_SLUGS, SLUG_PATTERN } from "../domain/establishment";

/**
 * Schémas de l'espace propriétaire (CLAUDE.md § 3.9) : utilisés par les
 * formulaires, les Server Actions et les services. Les messages disent quoi
 * faire, en français.
 */

/** Fuseaux proposés (CLAUDE.md § 3.8) : la RDC en compte deux. */
export const TIME_ZONES = [
  { id: "Africa/Lubumbashi", label: "Est de la RDC (Bukavu, Goma, Lubumbashi), UTC+2" },
  { id: "Africa/Kinshasa", label: "Ouest de la RDC (Kinshasa), UTC+1" },
] as const;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères au plus.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const identitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom compte au moins 2 caractères.")
    .max(80, "Le nom compte au plus 80 caractères."),
  legalName: optionalText(120, "Raison sociale"),
  address: optionalText(200, "Adresse"),
  phone: optionalText(30, "Téléphone"),
});

export const createEstablishmentSchema = identitySchema.extend({
  slug: z
    .string()
    .trim()
    .regex(
      SLUG_PATTERN,
      "L'adresse ne contient que des minuscules, des chiffres et des tirets (40 au plus).",
    )
    .refine(
      (slug) => !RESERVED_SLUGS.has(slug),
      "Cette adresse est réservée : choisissez-en une autre.",
    ),
  type: z.enum(ESTABLISHMENT_TYPES.map((type) => type.id) as [string, ...string[]], {
    error: "Choisissez le type d'activité.",
  }),
  currency: z.enum(CURRENCIES, { error: "Choisissez la devise de base." }),
  timeZone: z.enum(TIME_ZONES.map((zone) => zone.id) as [string, ...string[]], {
    error: "Choisissez le fuseau horaire.",
  }),
  withDefaultServicePoints: z.boolean(),
});

export type IdentityInput = z.input<typeof identitySchema>;
export type CreateEstablishmentInput = z.input<typeof createEstablishmentSchema>;

/** Paramètres d'établissement versionnés (table `establishment_settings`, CLAUDE.md § 2.5). */
export const establishmentSettingsSchema = z.object({
  version: z.literal(1),
  identity: z.object({
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
});

export type EstablishmentSettings = z.infer<typeof establishmentSettingsSchema>;

export function readSettings(value: unknown): EstablishmentSettings {
  const parsed = establishmentSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : { version: 1, identity: { address: null, phone: null } };
}
