/**
 * Serveur des tests de bout en bout (D-062) : `next start`, dont la sortie
 * d'erreur est aussi copiée dans `.e2e/server-errors.log`. Après les tests,
 * `tests/e2e/global-teardown.ts` y cherche les erreurs de rendu de Next.js.
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3100";
mkdirSync(".e2e", { recursive: true });
const log = createWriteStream(path.join(".e2e", "server-errors.log"), { flags: "w" });

const child = spawn(
  process.execPath,
  [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", port],
  { stdio: ["ignore", "inherit", "pipe"], env: process.env },
);
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});
child.on("exit", (code) => {
  log.end();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
