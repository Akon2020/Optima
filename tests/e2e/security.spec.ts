import { expect, test } from "@playwright/test";

/**
 * Politique de contenu avec nonce et en-têtes (CLAUDE.md § 5.4, D-029), et
 * protection des espaces connectés (§ 3.3) : vérifiés sur le serveur de
 * production, service worker bloqué pour lire les vraies réponses.
 */
test.use({ serviceWorkers: "block" });

const PAGES: { path: string; ready: string }[] = [
  { path: "/", ready: "body" },
  { path: "/connexion", ready: "form" },
  { path: "/hors-ligne", ready: "h1" },
  { path: "/e/demo/restaurant", ready: "text=Tableau de bord" },
  { path: "/e/demo/restaurant/commandes/nouvelle", ready: "text=Primus" },
  { path: "/e/demo/restaurant/menus", ready: "text=Primus" },
];

for (const { path, ready } of PAGES) {
  test(`CSP : ${path} sans violation, chaque script porte le nonce`, async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as unknown as { __csp: string[] };
      target.__csp = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        target.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    const response = await page.goto(path);
    // Le JavaScript s'exécute : le contenu rendu par React apparaît.
    await expect(page.locator(ready).first()).toBeVisible();

    const headers = response?.headers() ?? {};
    const csp = headers["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, "nonce dans l'en-tête CSP").toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // HTML brut demandé hors du navigateur : un antivirus qui inspecte le trafic
    // du poste peut injecter ses propres scripts dans les pages qu'il affiche.
    const raw = await page.request.get(path);
    const rawNonce = /'nonce-([^']+)'/.exec(raw.headers()["content-security-policy"] ?? "")?.[1];
    const html = await raw.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(rawNonce).not.toBe(nonce); // un nonce neuf à chaque requête
    expect(scripts.filter((tag) => !tag.includes(`nonce="${rawNonce}"`))).toEqual([]);

    await page.waitForTimeout(300);
    const violations = await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    );
    expect(violations).toEqual([]);
  });
}

test("§ 3.3 : les espaces connectés renvoient vers la connexion", async ({ page }) => {
  for (const path of ["/proprietaire", "/e/restaurant-best-food/appareils"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.locator("form").first()).toBeVisible();
  }
});
