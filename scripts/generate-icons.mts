/**
 * Icônes de l'application installable, rendues par le navigateur installé
 * (`playwright-core`, D-027). [À COMPLÉTER : D-Q11] Icônes provisoires : un
 * « O » blanc sur le bleu nuit de la charte générale. Quand le logo sera
 * choisi, remplacer le dessin ci-dessous et relancer :
 *   pnpm exec tsx scripts/generate-icons.mts
 */
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { BRAND_TOKENS } from "../src/styles/tokens/brand";

const OUT = "public/icons";

/** Dessin sur 100 unités ; `inset` réduit le motif pour la zone sûre des icônes « maskable ». */
function svg(size: number, { maskable }: { maskable: boolean }): string {
  const radius = maskable ? 0 : 22;
  const scale = maskable ? 0.72 : 1;
  const offset = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" fill="${BRAND_TOKENS.navy}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <circle cx="50" cy="50" r="25" fill="none" stroke="${BRAND_TOKENS.white}" stroke-width="11"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PDF_BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
const page = await context.newPage();
for (const target of targets) {
  await page.setViewportSize({ width: target.size, height: target.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(target.size, target)}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: `${OUT}/${target.file}`, omitBackground: true });
  console.log(`${OUT}/${target.file}`);
}
await context.close();
process.exit(0);
