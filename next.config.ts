import type { NextConfig } from "next";

import { staticSecurityHeaders } from "./src/server/security/headers";

// HSTS seulement si l'application est servie en HTTPS (CLAUDE.md § 5.4).
const isHttps = (process.env.APP_ORIGIN ?? "").startsWith("https://");

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  async headers() {
    return [
      {
        // En-têtes de sécurité fixes, sur toutes les réponses (pages, API, fichiers).
        // La CSP avec nonce est posée par le proxy (src/proxy.ts), page par page.
        source: "/:path*",
        headers: staticSecurityHeaders({ isHttps }),
      },
      {
        // Service worker (D-028) : toujours revalidé, pour qu'une nouvelle
        // version soit prise dès le déploiement.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
