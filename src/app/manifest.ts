import type { MetadataRoute } from "next";

import { LAUNCH_URL } from "@/offline/cache-rules";
import { BRAND_TOKENS } from "@/styles/tokens/brand";

/**
 * Manifeste de l'application installable (EF-OFF-05). L'application installée
 * s'ouvre sur `/ouvrir`, qui reprend le dernier établissement ouvert sur
 * l'appareil, même hors connexion.
 * [À COMPLÉTER : D-Q11] icônes provisoires tant que le logo n'est pas choisi
 * (`scripts/generate-icons.mts` les régénère).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OPTIMA",
    short_name: "OPTIMA",
    description: "Caisse, commandes, stock et clôtures, même sans connexion.",
    lang: "fr",
    dir: "ltr",
    start_url: LAUNCH_URL,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND_TOKENS.white,
    theme_color: BRAND_TOKENS.navy,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
