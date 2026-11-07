import { z } from "zod";

/** Saisie d'un nouvel élément de menu (EF-CAT-01, EF-RES-03). */
export const menuItemInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(80, "Le nom ne doit pas dépasser 80 caractères."),
  servicePointId: z.string().min(1, "Choisissez le point de service."),
  unit: z.enum(["bottle", "dish", "piece"], { message: "Choisissez l'unité de vente." }),
  category: z.string().trim().max(40, "La catégorie ne doit pas dépasser 40 caractères."),
  description: z.string().trim().max(160, "La description ne doit pas dépasser 160 caractères."),
  /** Prix en francs congolais ; vide = « À fixer » (RG-PRX-01). */
  priceMajor: z
    .number({ message: "Le prix doit être un nombre." })
    .int("Le prix doit être un nombre entier de francs.")
    .positive("Le prix doit être supérieur à zéro.")
    .max(10_000_000, "Ce prix semble trop élevé : vérifiez la saisie.")
    .nullable(),
});

export type MenuItemInput = z.infer<typeof menuItemInputSchema>;
