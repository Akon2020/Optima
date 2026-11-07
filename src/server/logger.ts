import pino from "pino";

/**
 * Journal technique (CLAUDE.md § 5.7), distinct du journal d'audit. Les
 * champs sensibles sont masqués automatiquement, à toute profondeur.
 */
const SENSITIVE = ["password", "pin", "token", "secret", "authorization", "cookie"];

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : (process.env.LOG_LEVEL ?? "info"),
  redact: {
    paths: SENSITIVE.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
    censor: "[masqué]",
  },
});
