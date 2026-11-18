import "@/shared/lib/zod-config";

import { z } from "zod";

/**
 * Commande saisie par le serveur (EF-CMD-01). Le client n'envoie que des
 * identifiants et des quantités : les prix, les totaux et la répartition sont
 * recalculés à partir du menu (CLAUDE.md § 3.9).
 */
export const orderInputSchema = z
  .object({
    mode: z.enum(["dine-in", "takeaway", "delivery"]),
    tableId: z.string().min(1).nullable(),
    lines: z
      .array(
        z.object({
          menuItemId: z.string().min(1),
          quantity: z.number().int().min(1).max(999),
          /** Options choisies (D-060). */
          optionIds: z.array(z.string().min(1)).max(12).optional(),
        }),
      )
      .min(1, "Ajoutez au moins un élément à la commande."),
    /** Livraison (EF-LIV-01, D-070) : contrôlée en détail par `checkDeliveryDetails`. */
    delivery: z
      .object({
        customerName: z.string(),
        phone: z.string(),
        address: z.string(),
        zoneId: z.string(),
        desiredTime: z.string(),
      })
      .optional(),
  })
  .refine((value) => value.mode !== "dine-in" || value.tableId !== null, {
    message: "Choisissez la table avant de valider la commande.",
    path: ["tableId"],
  })
  .refine((value) => value.mode !== "delivery" || value.delivery !== undefined, {
    message: "Indiquez les coordonnées de la livraison.",
    path: ["delivery"],
  });

export type OrderInput = z.infer<typeof orderInputSchema>;
