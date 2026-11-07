/**
 * Paramètres de sécurité des comptes (CLAUDE.md § 5.1, § 5.2, § 5.6),
 * regroupés pour rester faciles à ajuster.
 */
export const AUTH_POLICY = {
  /** RG-AUT-02 : 5 échecs en 15 minutes, par compte et par adresse IP. */
  maxFailedAttempts: 5,
  failedAttemptsWindowMs: 15 * 60_000,
  /** RG-AUT-03 : fermeture après inactivité, plus courte pour le propriétaire. */
  idleTimeoutMs: { owner: 30 * 60_000, member: 12 * 60 * 60_000 },
  /** Durée maximale absolue d'une session. */
  absoluteLifetimeMs: { owner: 12 * 60 * 60_000, member: 7 * 24 * 60 * 60_000 },
  /** La date de dernière activité n'est réécrite qu'au-delà de ce délai. */
  touchIntervalMs: 60_000,
  sessionCookieName: "__Host-optima_session",
} as const;

/**
 * Identifiant de connexion (EF-AUT-01) : adresse e-mail en minuscules, ou
 * numéro de téléphone réduit à ses chiffres (avec le « + » initial).
 */
export function normalizeIdentifier(
  raw: string,
): { kind: "email" | "phone"; value: string } | null {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: "email", value: email } : null;
  }
  const phone = value.replace(/[\s().-]/g, "");
  return /^\+?\d{8,15}$/.test(phone) ? { kind: "phone", value: phone } : null;
}
