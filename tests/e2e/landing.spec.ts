import { expect, test } from "@playwright/test";

/**
 * Landing page (docs/LANDING_PAGE.md § 5, D-068) : chargement, titres,
 * ancres, menu mobile, thème retenu après rechargement, absence de flash en
 * sombre, mentions légales. Le contrôle axe et les captures dans les deux
 * thèmes sont dans `theme.spec.ts`.
 */
const SECTIONS = [
  "constat",
  "fonctionnalites",
  "modules",
  "fonctionnement",
  "hors-connexion",
  "securite",
];

test("landing : un seul h1, les sections et la signature", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("OPTIMA · Pilotez tous vos établissements");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Tous vos établissements, un seul outil de gestion.");
  for (const id of SECTIONS) await expect(page.locator(`section#${id}`)).toBeAttached();

  // Le bouton de démo mène à l'aperçu local du Restaurant (D-018).
  const hero = page.locator("section", { has: page.locator("h1") });
  await expect(hero.getByRole("link", { name: "Voir la démo" })).toHaveAttribute(
    "href",
    "/e/demo/restaurant",
  );

  // D-068 : pas de contact ; coordonnées « Bukavu, RDC ».
  await expect(page.locator("footer")).toContainText("Bukavu, RDC");
  await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0);

  // D-030 : non indexée par défaut.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("landing : les ancres mènent aux sections", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("navigation", { name: "Sections de la page" })
    .getByRole("link", { name: "Sécurité" })
    .click();
  await expect(page).toHaveURL(/#securite$/);
  await expect(page.getByRole("heading", { name: "Sécurité et traçabilité" })).toBeInViewport();
});

test("landing : modules en onglets, avec leur état (D-012)", async ({ page }) => {
  await page.goto("/#modules");
  const tabs = page.getByRole("tablist", { name: "Modules d'OPTIMA" });
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  const panel = page.getByRole("tabpanel");

  // Le Restaurant est ouvert d'abord, avec la démo.
  await expect(tabs.getByRole("tab", { name: "Restaurant" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel.getByText("En développement")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Voir la démo" })).toBeVisible();

  // Flèche à droite : la Boutique, « Prévu », sans démo.
  await tabs.getByRole("tab", { name: "Restaurant" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Boutique" })).toBeFocused();
  await expect(panel.getByText("Prévu", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Voir la démo" })).toHaveCount(0);
});

test("landing : un principe de sécurité ouvert à la fois", async ({ page }) => {
  await page.goto("/#securite");
  const audit = page.getByRole("button", { name: "Journal d'audit inaltérable" });
  await audit.click();
  await expect(audit).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Données séparées" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("landing : menu mobile, Échap et lien vers une section", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const openButton = page.getByRole("button", { name: "Ouvrir le menu" });
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();

  await openButton.click();
  await dialog.getByRole("link", { name: "Fonctionnement" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Une journée avec OPTIMA" })).toBeInViewport();
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
});

test("landing : le thème choisi est retenu après rechargement, sans flash", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.locator("header").getByRole("radio", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Le script de next-themes pose le thème avant le premier rendu : il est
  // déjà là dès l'analyse du HTML, avant l'hydratation.
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await expect(page.locator("header").getByRole("radio", { name: "Sombre" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("mentions légales : accessibles depuis le pied de page", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Mentions légales" }).click();
  await expect(page).toHaveURL(/\/mentions-legales$/);
  await expect(page.getByRole("heading", { name: "Mentions légales", level: 1 })).toBeVisible();
  // Le repère « provisoire » n'apparaît jamais en production.
  await expect(page.getByText("provisoire", { exact: true })).toHaveCount(0);
});

test("image de partage : générée en PNG", async ({ request }) => {
  const response = await request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});
