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
        }),
      )
      .min(1, "Ajoutez au moins un élément à la commande."),
  })
  .refine((value) => value.mode !== "dine-in" || value.tableId !== null, {
    message: "Choisissez la table avant de valider la commande.",
    path: ["tableId"],
  });

export type OrderInput = z.infer<typeof orderInputSchema>;
