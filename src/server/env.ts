import "server-only";

import { z } from "zod";

/**
 * Variables d'environnement validées (CLAUDE.md § 5.5). Les secrets ne sont
 * lus qu'ici. En production, `instrumentation.ts` appelle `getEnv()` au
 * démarrage : l'application refuse de démarrer si une variable manque.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL doit être une URL PostgreSQL."),
  /** Clé AES-256 (32 octets en base64) qui chiffre les secrets TOTP. */
  AUTH_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "AUTH_ENCRYPTION_KEY doit faire 32 octets encodés en base64.",
    ),
  /** Origine publique de l'application, contrôlée sur les requêtes modifiantes. */
  APP_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Seuls les noms des variables sont cités, jamais leurs valeurs.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} : ${issue.message}`)
      .join("\n  - ");
    throw new Error(`Configuration invalide :\n  - ${problems}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.APP_ORIGIN) {
    throw new Error("Configuration invalide :\n  - APP_ORIGIN est obligatoire en production.");
  }
  cached = parsed.data;
  return cached;
}
