import { expect, test } from "@playwright/test";

import { DEMO, addItem, openDemo } from "./helpers";

/**
 * Travail hors connexion (EF-OFF-05, ENF-01, ENF-13, D-028) : après une
 * première visite, l'application se recharge sans réseau, ouvre les autres
 * pages du Restaurant et enregistre une commande ; les pages en ligne
 * affichent la page « Pas de connexion ».
 */
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });

test("EF-OFF-05 : le Restaurant fonctionne sans réseau après une première visite", async ({
  page,
  context,
}) => {
  test.slow();
  await openDemo(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();

  // Le service worker prépare les pages du menu en arrière-plan : on attend
  // celles que le test ouvre ensuite sans réseau.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const cache = await caches.open("optima-restaurant-pages");
          const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);
          return ["/tables", "/commandes/nouvelle"].every((end) =>
            paths.some((path) => path.endsWith(end)),
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  // CLAUDE.md § 5.5 : ni l'API ni les pages en ligne ne sont mises en cache.
  const forbidden = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (/^\/(api|proprietaire|connexion)/.test(path)) return path;
      }
    }
    return null;
  });
  expect(forbidden).toBeNull();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();

  await page.goto(`${DEMO}/tables`);
  await expect(page.getByRole("heading", { name: "Tables" }).first()).toBeVisible();

  // ENF-01 : commande enregistrée en moins de 2 secondes, sans réseau.
  await page.goto(`${DEMO}/commandes/nouvelle`);
  await page.getByRole("radio", { name: "À emporter" }).click();
  await addItem(page, "Primus 72 cl");
  await page.getByRole("button", { name: /Voir la commande/ }).click();
  const started = Date.now();
  await page
    .getByRole("dialog", { name: "Commande en cours" })
    .getByRole("button", { name: "Valider la commande" })
    .click();
  await expect(page.getByRole("dialog", { name: "Commande enregistrée" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2_000);

  // Les écrans qui exigent le réseau affichent la page de secours.
  await page.goto("/proprietaire");
  await expect(page.getByRole("heading", { name: "Pas de connexion" })).toBeVisible();

  await context.setOffline(false);
});
