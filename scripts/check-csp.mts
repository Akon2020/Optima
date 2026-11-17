/**
 * Vérification de la politique de contenu (CSP avec nonce, CLAUDE.md § 5.4)
 * dans le Chrome installé, sur un serveur de production :
 *   pnpm build && pnpm exec next start -p 3100
 *   pnpm check:csp               (ou : pnpm check:csp http://localhost:3100)
 * Pour chaque page : aucune violation de la CSP, chaque script du HTML porte le nonce
 * de la requête, et le JavaScript s'exécute (le Restaurant s'affiche, ce qui
 * exige React). Le processus s'arrête en erreur au premier problème.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";

/** Pages publiques ou de démonstration ; les autres redirigent vers la connexion. */
const PAGES: { path: string; expect: string }[] = [
  { path: "/", expect: "body" },
  { path: "/connexion", expect: "form" },
  { path: "/hors-ligne", expect: "h1" },
  { path: "/e/demo/restaurant", expect: "text=Tableau de bord" },
  { path: "/e/demo/restaurant/commandes/nouvelle", expect: "text=Primus" },
  { path: "/e/demo/restaurant/tables", expect: "text=Tables" },
  { path: "/proprietaire", expect: "form" },
];

const browser = await chromium.launch({
  channel: process.env.PDF_BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const context = await browser.newContext({ serviceWorkers: "block" });
// Les violations sont collectées par un écouteur posé avant tout script de la page.
await context.addInitScript(() => {
  const target = window as unknown as { __csp: string[] };
  target.__csp = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    target.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
});

const failures: string[] = [];
for (const { path, expect } of PAGES) {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      consoleErrors.push(message.text().slice(0, 200));
    }
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page
    .locator(expect)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {
      failures.push(`${path} : contenu attendu absent (${expect}), JavaScript bloqué ?`);
    });
  await page.waitForTimeout(500);
  // HTML brut de la page finale, demandé à part : sa réponse a son propre nonce.
  // Chaque script présent dans le HTML doit le porter ; ceux que le code charge
  // ensuite sont admis par 'strict-dynamic' sans nonce propre.
  const raw = await context.request.get(page.url());
  const header = raw.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(header)?.[1];
  const scriptTags = (await raw.text()).match(/<script\b[^>]*>/g) ?? [];
  const withoutNonce = scriptTags.filter((tag) => !tag.includes(`nonce="${nonce}"`)).length;
  const violations = await page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
  if (!nonce) failures.push(`${path} : en-tête CSP sans nonce`);
  if (withoutNonce > 0) failures.push(`${path} : ${withoutNonce} script(s) sans le nonce`);
  for (const violation of [...violations, ...consoleErrors]) {
    failures.push(`${path} : violation ${violation}`);
  }
  console.log(
    `${path} → ${page.url().replace(BASE, "")} : ${scriptTags.length} scripts dans le HTML, ${violations.length} violation(s)`,
  );
  await page.close();
}

await browser.close().catch(() => undefined);
if (failures.length > 0) {
  console.error(`\nÉchec :\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nCSP : aucune violation, tous les scripts portent le nonce.");
process.exit(0);
