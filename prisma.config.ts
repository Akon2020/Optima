import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma 7 ne lit plus .env tout seul : les variables locales viennent de
// .env.local (jamais committé, CLAUDE.md § 5.5).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Les migrations utilisent un rôle distinct de l'application (CLAUDE.md § 3.8).
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
