/**
 * Construction du service worker (D-028), lancée par `pnpm build` après
 * `next build` :
 * 1. esbuild compile `src/offline/sw/sw.ts` (Serwist) en un seul fichier ;
 * 2. `@serwist/build` y injecte la liste des fichiers statiques à précacher
 *    (ceux de `.next/static`, déjà versionnés par leur nom) et des pages
 *    hors ligne, puis écrit `public/sw.js` (non versionné dans Git).
 *
 * `@serwist/turbopack` n'est pas utilisé : il dépend du binaire natif de
 * `@swc/core`, bloqué par la politique de sécurité Windows du poste.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { injectManifest } from "@serwist/build";
import { build } from "esbuild";

const BUNDLE = ".next/sw.bundle.js";
const DEST = "public/sw.js";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim() ||
  crypto.randomUUID();

mkdirSync(".next", { recursive: true });
await build({
  entryPoints: ["src/offline/sw/sw.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: BUNDLE,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const { count, size, warnings } = await injectManifest({
  swSrc: BUNDLE,
  swDest: DEST,
  globDirectory: ".next",
  globPatterns: ["static/**/*.{js,css,woff,woff2}"],
  modifyURLPrefix: { "static/": "/_next/static/" },
  // Fichiers de .next/static : leur nom contient déjà une empreinte.
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  additionalPrecacheEntries: [
    { url: "/hors-ligne", revision },
    { url: "/ouvrir", revision },
    { url: "/manifest.webmanifest", revision },
    { url: "/icons/icon-192.png", revision },
    { url: "/icons/icon-512.png", revision },
  ],
});

for (const warning of warnings) console.warn(`service worker : ${warning}`);
console.log(
  `Service worker écrit dans ${DEST} : ${count} fichiers précachés (${Math.round(size / 1024)} Ko).`,
);
