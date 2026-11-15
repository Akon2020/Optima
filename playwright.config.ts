import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout (CLAUDE.md § 6.2) sur un serveur de production :
 *   pnpm build
 *   pnpm test:e2e
 * Le serveur (`next start -p 3100`) est lancé s'il ne tourne pas déjà. Le
 * navigateur est le Chrome installé (aucun téléchargement), comme pour les
 * exports PDF (D-027) ; en intégration continue, celui du runner.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    locale: "fr-FR",
    timezoneId: "Africa/Lubumbashi",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chrome" }],
  // E2E_BASE_URL : serveur déjà lancé ailleurs (préproduction), aucun serveur local.
  webServer: process.env.E2E_BASE_URL
    ? []
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `${BASE_URL}/connexion`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
