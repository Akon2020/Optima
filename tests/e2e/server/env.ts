import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Base des tests de bout en bout (D-062). Par défaut, celle de `.env.local`
 * avec le nom `optima_e2e` (même rôles, même mots de passe) ; la CI donne
 * `E2E_DATABASE_URL` et `E2E_MIGRATION_DATABASE_URL`.
 */
export const E2E_DATABASE = "optima_e2e";
export const E2E_SLUG = "restaurant-e2e";
export const E2E_STATE_FILE = path.join(".e2e", "accounts.json");

let loaded = false;
function loadLocalEnv(): void {
  if (loaded) return;
  loaded = true;
  // Ne remplace jamais une variable déjà posée (CI, ligne de commande).
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

function withDatabase(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const parsed = new URL(url);
  parsed.pathname = `/${E2E_DATABASE}`;
  return parsed.toString();
}

export function e2eDatabaseUrls(): { app: string; migration: string } | null {
  loadLocalEnv();
  const app = process.env.E2E_DATABASE_URL ?? withDatabase(process.env.DATABASE_URL);
  const migration =
    process.env.E2E_MIGRATION_DATABASE_URL ?? withDatabase(process.env.MIGRATION_DATABASE_URL);
  return app && migration ? { app, migration } : null;
}

export type E2eAccount = { email: string; password: string; name: string };
export type E2eState =
  | { available: false; reason: string }
  | {
      available: true;
      slug: string;
      establishmentName: string;
      owner: E2eAccount & { totpSecret: string };
      manager: E2eAccount;
      waiter: E2eAccount;
    };

/** État écrit par la préparation de la base (`scripts/e2e/prepare-db.mts`). */
export function readE2eState(): E2eState {
  if (!existsSync(E2E_STATE_FILE)) {
    return { available: false, reason: "préparation de la base non lancée" };
  }
  return JSON.parse(readFileSync(E2E_STATE_FILE, "utf8")) as E2eState;
}
