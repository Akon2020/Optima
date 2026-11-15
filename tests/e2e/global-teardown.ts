import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Après les tests : le serveur ne doit avoir journalisé aucune erreur de
 * rendu de Next.js (par exemple « unstable value `new Date()` while
 * prerendering »), même quand la page s'affiche quand même.
 */
const PATTERNS = [/Next\.js encountered/, /Error: Route "/];

export default function globalTeardown(): void {
  const file = path.join(".e2e", "server-errors.log");
  if (!existsSync(file)) return;
  const problems = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => PATTERNS.some((pattern) => pattern.test(line)));
  if (problems.length > 0) {
    throw new Error(
      `Le serveur a journalisé ${problems.length} erreur(s) de rendu :\n- ${[...new Set(problems)].join("\n- ")}`,
    );
  }
}
