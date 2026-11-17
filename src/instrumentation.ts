/**
 * Au démarrage du serveur de production, la configuration est validée :
 * l'application refuse de démarrer si une variable manque (CLAUDE.md § 5.5).
 * Rien n'est vérifié pendant le build ni en développement, pour qu'un poste
 * sans base de données puisse travailler sur l'interface.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv } = await import("./server/env");
  getEnv();
}
