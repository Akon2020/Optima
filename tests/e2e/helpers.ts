import { expect, type Page } from "@playwright/test";

/** Aperçu local du Restaurant, sur données de démonstration (D-018). */
export const DEMO = "/e/demo/restaurant";

/** Ouvre une page de l'aperçu et attend que la base locale de démonstration soit prête. */
export async function openDemo(page: Page, path = ""): Promise<void> {
  await page.goto(`${DEMO}${path}`);
  await expect(page.getByText("Données de démonstration").first()).toBeVisible();
}

/** Ajoute un élément du menu au panier de la prise de commande. */
export async function addItem(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Ajouter ${name}`, exact: true }).click();
}

/** Montant affiché (« 16 000 FC ») converti en nombre, espaces insécables compris. */
export function francs(text: string): number {
  return Number(text.replace(/[^\d]/g, ""));
}
