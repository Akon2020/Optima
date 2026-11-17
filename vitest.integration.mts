import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests d'intégration (CLAUDE.md § 6.2) : vraie base PostgreSQL 18 embarquée
 * (PGlite), migrations du dépôt, rôle applicatif sans BYPASSRLS. Aucun mot de
 * passe ni serveur PostgreSQL n'est nécessaire pour les lancer.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/integration/helpers/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
