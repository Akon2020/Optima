import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { DEMO, openDemo } from "./helpers";

/**
 * Thèmes et accessibilité (CLAUDE.md § 4.3, § 4.4) : le choix du thème est
 * posé sur `<html>` et retenu ; les deux chartes (générale et Restaurant)
 * passent le contrôle axe (WCAG 2.2 AA) en clair et en sombre. Une capture
 * de chaque combinaison est jointe au rapport.
 */
test("§ 4.3 : le thème choisi est appliqué et retenu", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDemo(page);
  const switcher = page.getByRole("radiogroup", { name: "Thème d'affichage" }).first();
  await switcher.getByRole("radio", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("optima:theme"))).toBe("dark");

  // Retenu d'une page à l'autre, y compris hors du module Restaurant.
  await page.goto("/connexion");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto(DEMO);
  await page
    .getByRole("radiogroup", { name: "Thème d'affichage" })
    .first()
    .getByRole("radio", { name: "Clair" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

/** Pages contrôlées : charte générale puis charte Restaurant (§ 4.1). */
const SCREENS: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: "accueil",
    path: "/",
    ready: async (page) => {
      await expect(page.locator("main").first()).toBeVisible();
    },
  },
  {
    name: "mentions-legales",
    path: "/mentions-legales",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Mentions légales", level: 1 })).toBeVisible();
    },
  },
  {
    name: "connexion",
    path: "/connexion",
    ready: async (page) => {
      await expect(page.locator("form").first()).toBeVisible();
    },
  },
  {
    name: "restaurant-tableau-de-bord",
    path: "",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Tableau de bord" }).first()).toBeVisible();
    },
  },
  {
    name: "restaurant-nouvelle-commande",
    path: "/commandes/nouvelle",
    ready: async (page) => {
      await expect(page.getByText("Primus 72 cl").first()).toBeVisible();
    },
  },
  {
    name: "restaurant-preparation",
    path: "/preparation/cuisine",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Cuisine", level: 1 })).toBeVisible();
      // La liste « Prêtes, à servir » dépend de l'heure dans la démo : une commande
      // est marquée prête si possible, pour que le contrôle couvre aussi ses boutons.
      const ready = page.getByRole("button", { name: "Prête", exact: true }).first();
      if (await ready.isVisible()) {
        await ready.click();
        await expect(page.getByRole("button", { name: /^Annuler : / }).first()).toBeVisible();
      }
    },
  },
  {
    name: "restaurant-requisitions",
    path: "/requisitions",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Réquisitions", level: 1 })).toBeVisible();
    },
  },
  {
    name: "restaurant-livraisons",
    path: "/livraisons",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Livraisons", level: 1 })).toBeVisible();
    },
  },
  {
    name: "restaurant-menus",
    path: "/menus",
    ready: async (page) => {
      await expect(page.getByText("Primus 72 cl").first()).toBeVisible();
    },
  },
];

for (const scheme of ["light", "dark"] as const) {
  for (const screen of SCREENS) {
    test(`a11y : ${screen.name} (${scheme === "light" ? "clair" : "sombre"})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      if (screen.name.startsWith("restaurant")) await openDemo(page, screen.path);
      else await page.goto(screen.path);
      await screen.ready(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");

      await testInfo.attach(`${screen.name}-${scheme}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact ?? "?"}) : ${violation.nodes
            .slice(0, 3)
            .map((node) => `${node.target.join(" ")} ${node.any[0]?.message ?? ""}`)
            .join(" | ")}`,
      );
      expect(summary).toEqual([]);
    });
  }
}
