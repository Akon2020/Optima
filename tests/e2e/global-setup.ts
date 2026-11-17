import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Avant les tests : prépare la base `optima_e2e` (D-062). Sans base, en
 * local, seuls les parcours qui exigent le serveur sont sautés.
 */
export default function globalSetup(): void {
  execFileSync(
    process.execPath,
    [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/e2e/prepare-db.mts"],
    { stdio: "inherit" },
  );
}
