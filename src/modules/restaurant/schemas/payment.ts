import "@/shared/lib/zod-config";

import { z } from "zod";

/**
 * Encaissement saisi sur l'appareil (EF-ENC-02). L'écran n'envoie que les
 * factures à régler, le mode, la devise et le montant reçu : le reste à
 * payer, la contre-valeur, la monnaie et les affectations sont recalculés
 * par le dépôt local, puis revérifiés par le serveur.
 */
export const paymentInputSchema = z
  .object({
    invoiceIds: z.array(z.string().min(1)).min(1, "Choisissez la facture à encaisser.").max(50),
    method: z.enum(["cash", "mobile-money"]),
    provider: z.enum(["mpesa", "orange-money", "airtel-money"]).nullable(),
    reference: z
      .string()
      .trim()
      .max(40, "La référence compte 40 caractères au plus.")
      .nullable()
      .transform((value) => (value === "" ? null : value)),
    currency: z.enum(["CDF", "USD"]),
    amountMajor: z
      .number({ error: "Saisissez le montant reçu." })
      .positive("Saisissez le montant reçu.")
      .max(1_000_000_000, "Ce montant est trop élevé."),
  })
  .refine((value) => value.method !== "mobile-money" || value.provider !== null, {
    message: "Choisissez l'opérateur Mobile Money.",
    path: ["provider"],
  });

export type PaymentInput = z.input<typeof paymentInputSchema>;
