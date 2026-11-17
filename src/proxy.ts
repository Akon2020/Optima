import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy, generateNonce } from "@/server/security/headers";

/**
 * Proxy Next.js (CLAUDE.md § 5.4) : une politique de contenu (CSP) avec un
 * nonce neuf à chaque page. Next.js lit le nonce dans l'en-tête de la requête
 * et l'ajoute lui-même à ses scripts ; `x-nonce` le transmet aux composants
 * qui posent leurs propres scripts (thèmes).
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: (process.env.APP_ORIGIN ?? "").startsWith("https://"),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages seulement : ni l'API (JSON), ni les fichiers statiques, ni le service worker.
      source:
        "/((?!api|_next/static|_next/image|icons|favicon\\.ico|sw\\.js|manifest\\.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
