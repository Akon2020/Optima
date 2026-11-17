/**
 * Vérification hors connexion de la PWA (EF-OFF-05, CLAUDE.md § 6.2), en
 * attendant les tests Playwright de bout en bout :
 *   pnpm build && pnpm exec next start -p 3100
 *   pnpm check:offline            (ou : pnpm check:offline http://localhost:3100)
 * Pilote le Chrome installé (playwright-core), visite l'aperçu Restaurant en
 * ligne, coupe le réseau, puis vérifie : rechargement, pages du menu, prise de
 * commande, page de secours, et l'absence de l'API dans les caches.
 * Le processus s'arrête en erreur au premier contrôle qui échoue.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const t0 = Date.now();
const log = (message: string) =>
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${message}`);
const results: Record<string, unknown> = {};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("pageerror", (error) => log(`erreur de page : ${error.message}`));

// 1. Première visite en ligne : le service worker s'installe et prend la main.
await page.goto(`${BASE}/e/demo/restaurant`, { waitUntil: "load" });
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.reload({ waitUntil: "load" });
results.controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
await page.getByRole("heading", { name: "Tableau de bord" }).first().waitFor({ timeout: 20000 });
log("en ligne : tableau de bord affiché, service worker actif");

// Laisse le service worker préparer les pages du menu.
await page.waitForTimeout(6000);
results.cachedPages = await page.evaluate(async () => {
  const cache = await caches.open("optima-restaurant-pages");
  return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
});
results.cacheNames = await page.evaluate(async () => caches.keys());
results.apiInAnyCache = await page.evaluate(async () => {
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      if (
        path.startsWith("/api/") ||
        path.startsWith("/proprietaire") ||
        path.startsWith("/connexion")
      ) {
        return path;
      }
    }
  }
  return null;
});

// 2. Coupure du réseau, puis rechargement complet.
await context.setOffline(true);
await page.reload({ waitUntil: "load" });
await page.getByRole("heading", { name: "Tableau de bord" }).first().waitFor({ timeout: 20000 });
results.offlineReloadDashboard = true;
log("hors ligne : rechargement du tableau de bord réussi");

// 3. Autre page du menu, jamais ouverte, préparée par le service worker.
await page.goto(`${BASE}/e/demo/restaurant/tables`, { waitUntil: "load" });
await page.getByRole("heading", { name: "Tables" }).first().waitFor({ timeout: 20000 });
results.offlineTablesPage = true;
log("hors ligne : page Tables ouverte");

// 4. Prise de commande hors ligne : la page s'ouvre et le menu s'affiche.
await page.goto(`${BASE}/e/demo/restaurant/commandes/nouvelle`, { waitUntil: "load" });
await page.getByText("Primus", { exact: false }).first().waitFor({ timeout: 20000 });
results.offlineNewOrder = true;
log("hors ligne : prise de commande ouverte avec le menu");

// 5. Page qui exige le réseau : page de secours.
await page.goto(`${BASE}/proprietaire`, { waitUntil: "load" });
results.ownerOfflineFallback = await page
  .getByRole("heading", { name: "Pas de connexion" })
  .isVisible();
log(`hors ligne : /proprietaire → page de secours = ${String(results.ownerOfflineFallback)}`);

// 6. Retour du réseau.
await context.setOffline(false);
await page.goto(`${BASE}/hors-ligne`, { waitUntil: "load" });
results.onlineAgain = (await page.title()).includes("Hors ligne");

console.log(JSON.stringify(results, null, 2));
await browser.close().catch(() => undefined);
const failures = [
  results.controlled !== true && "service worker absent",
  results.apiInAnyCache !== null && `réponse en cache interdite : ${String(results.apiInAnyCache)}`,
  results.ownerOfflineFallback !== true && "page de secours absente",
].filter(Boolean);
if (failures.length > 0) {
  console.error(`Échec : ${failures.join(", ")}`);
  process.exit(1);
}
console.log("Hors connexion : tout fonctionne.");
process.exit(0);
