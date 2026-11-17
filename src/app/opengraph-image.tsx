import { ImageResponse } from "next/og";

import { BRAND_TOKENS } from "@/styles/tokens/brand";

import { BRAND, HERO } from "./(public)/_content/landing";

/**
 * Image de partage (docs/LANDING_PAGE.md § 5, SEO) : logotype, signature et
 * titre du hero sur le bleu nuit de la charte générale. Toujours en clair,
 * comme les documents imprimés.
 */
export const alt = `${BRAND.name} · ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        backgroundColor: BRAND_TOKENS.navy,
        color: BRAND_TOKENS.white,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 10 }}>{BRAND.name}</span>
        <span style={{ fontSize: 30, color: BRAND_TOKENS.navyLight }}>{BRAND.tagline}</span>
      </div>
      <div
        style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.15, maxWidth: 980 }}
      >
        {HERO.title}
      </div>
      <div style={{ display: "flex", fontSize: 28, color: BRAND_TOKENS.navyLight }}>
        {HERO.eyebrow}
      </div>
    </div>,
    size,
  );
}
