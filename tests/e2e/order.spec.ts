import { expect, test } from "@playwright/test";

import { addItem, francs, openDemo } from "./helpers";

/**
 * Parcours P2 (service en salle) sur l'aperçu de démonstration, au format
 * téléphone (ENF-05, 360 px) : prise de commande, factures d'avance par point
 * de service (EF-CMD-02), options et formules (D-060), puis encaissement
 * (EF-ENC-01, D-055).
 */
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

test("EF-CMD-02 : une commande à table produit une facture d'avance par poste", async ({
  page,
}) => {
  await openDemo(page, "/commandes/nouvelle");
  await page.getByRole("radio", { name: /^Table 2\b/ }).click();
  await addItem(page, "Primus 72 cl");
  await page.getByRole("tab", { name: /Nourriture/ }).click();
  await addItem(page, "Frites");

  // D-060 : le tilapia demande sa préparation ; le supplément s'ajoute au prix.
  await page.getByRole("button", { name: "Choisir les options de Tilapia" }).click();
  const picker = page.getByRole("dialog", { name: "Tilapia" });
  await expect(picker.getByRole("button", { name: /^Ajouter/ })).toBeDisabled();
  await picker.getByText("Frit", { exact: true }).click();
  await picker.getByText("Bananes plantains").click();
  await picker.getByRole("button", { name: "Ajouter · 17 000 FC" }).click();

  // D-060 : une formule part à la cuisine et au comptoir.
  await addItem(page, "Formule porc");

  await page.getByRole("button", { name: /Voir la commande/ }).click();
  const cart = page.getByRole("dialog", { name: "Commande en cours" });
  await expect(cart.getByText("Frit, Bananes plantains")).toBeVisible();
  await expect(cart.getByText("Cuisine + Comptoir")).toBeVisible();
  // 3 500 + 4 000 + 17 000 + 16 000.
  await expect(cart.getByText("40 500 FC", { exact: true })).toBeVisible();
  await cart.getByRole("button", { name: "Valider · 2 factures d'avance" }).click();

  const done = page.getByRole("dialog", { name: "Commande enregistrée" });
  await expect(done.getByText("2 factures d'avance à déposer")).toBeVisible();
  const tickets = done.locator(".print-area > *");
  await expect(tickets).toHaveCount(2);
  await expect(done.getByText("Facture d'avance · Comptoir")).toBeVisible();
  await expect(done.getByText("Facture d'avance · Cuisine")).toBeVisible();
  await expect(done.getByText("Frit · Bananes plantains")).toBeVisible();

  // Les totaux des deux factures font celui de la commande.
  const totals = await done.locator("p", { hasText: "TOTAL" }).allInnerTexts();
  expect(totals.map(francs).reduce((sum, value) => sum + value, 0)).toBe(40_500);
});

test("EF-ENC-01 : une commande à emporter s'encaisse en espèces", async ({ page }) => {
  await openDemo(page, "/commandes/nouvelle");
  await page.getByRole("radio", { name: "À emporter" }).click();
  for (let count = 0; count < 9; count += 1) await addItem(page, "Primus 72 cl");
  await page.getByRole("button", { name: /Voir la commande/ }).click();
  await page
    .getByRole("dialog", { name: "Commande en cours" })
    .getByRole("button", { name: "Valider la commande" })
    .click();
  await page
    .getByRole("dialog", { name: "Commande enregistrée" })
    .getByRole("link", { name: "Commandes" })
    .click();

  await page.getByRole("button", { name: /9× Primus 72 cl/ }).click();
  await page.getByRole("button", { name: "Encaisser 31 500 FC" }).click();
  const payment = page.getByRole("dialog", { name: /^Encaisser/ });
  await expect(payment.getByLabel("Montant reçu (FC)")).toHaveValue(/31\s?500/);
  await payment.getByRole("button", { name: "Encaisser 31 500 FC" }).click();

  const detail = page.getByRole("dialog", { name: /À emporter · 31 500 FC/ });
  await expect(detail.getByText("Payée", { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: /^Encaisser/ })).toHaveCount(0);
});
