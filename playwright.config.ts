import { defineConfig } from "@playwright/test";

import { e2eDatabaseUrls } from "./tests/e2e/server/env";

/**
 * Tests de bout en bout (CLAUDE.md § 6.2) sur un serveur de production :
 *   pnpm build
 *   pnpm test:e2e
 * Le serveur (`next start -p 3100`) est lancé pour les tests, branché sur la
 * base `optima_e2e` (D-062), préparée par `global-setup.ts`. Le navigateur est
 * le Chrome installé (aucun téléchargement), comme pour les exports PDF
 * (D-027) ; en intégration continue, celui du runner.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const database = e2eDatabaseUrls();

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        globalSetup: "./tests/e2e/global-setup.ts",
        globalTeardown: "./tests/e2e/global-teardown.ts",
      }),
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
        // `next start`, sortie d'erreur copiée pour global-teardown.ts.
        command: `node scripts/e2e/start-server.mjs ${PORT}`,
        url: `${BASE_URL}/connexion`,
        // Jamais un serveur déjà lancé : il pourrait viser la base de développement.
        reuseExistingServer: false,
        env: database ? { DATABASE_URL: database.app } : {},
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
