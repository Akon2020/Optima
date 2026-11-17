/**
 * En-têtes de sécurité (CLAUDE.md § 5.4). Fonctions pures, utilisées par le
 * proxy (`src/proxy.ts`) pour les pages et par `next.config.ts` pour le reste.
 *
 * Politique de contenu (CSP) stricte avec nonce : un script ne s'exécute que
 * s'il porte le nonce de la requête ('strict-dynamic' propage la confiance
 * aux scripts qu'il charge). Aucun 'unsafe-inline' pour les scripts.
 * Seuls les attributs `style="…"` restent permis (`style-src-attr`) : ils ne
 * peuvent pas exécuter de code, et React, Radix et les graphiques en posent.
 */

export type CspOptions = {
  nonce: string;
  /** Développement : React a besoin d'`eval` et de styles en ligne pour ses outils. */
  isDevelopment: boolean;
  /** HTTPS en production : les requêtes http sont transformées en https. */
  upgradeInsecureRequests: boolean;
};

export function buildContentSecurityPolicy(options: CspOptions): string {
  const nonce = `'nonce-${options.nonce}'`;
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      nonce,
      "'strict-dynamic'",
      ...(options.isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    ["style-src", "'self'", ...(options.isDevelopment ? ["'unsafe-inline'"] : [nonce])],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'"],
    // Synchronisation et Server Actions : même origine uniquement.
    ["connect-src", "'self'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["media-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-src", "'none'"],
    ["frame-ancestors", "'none'"],
  ];
  const policy = directives.map(([name, ...values]) => `${name} ${values.join(" ")}`);
  if (options.upgradeInsecureRequests) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Nonce de 128 bits, imprévisible et propre à chaque requête. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * En-têtes fixes, posés sur toutes les réponses (pages, API, fichiers).
 * HSTS seulement en HTTPS. La caméra (scan des codes-barres, EF-CAT-03), le
 * Bluetooth et l'USB (impression des tickets, CLAUDE.md § 3.12) sont réservés
 * à l'origine d'OPTIMA ; le reste est refusé.
 */
export function staticSecurityHeaders(options: { isHttps: boolean }): {
  key: string;
  value: string;
}[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(self), usb=(self), bluetooth=(self), microphone=(), geolocation=(), payment=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(options.isHttps
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : []),
  ];
}
