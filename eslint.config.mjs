import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// CLAUDE.md § 4.2, D-067 : pas de couleur littérale dans le code (classes
// Tailwind « bg-[#…] », styles en ligne, SVG) ; elles vivent dans les tokens
// (`src/styles/tokens/`). Stylelint fait la même chose pour les fichiers CSS.
const HEX_COLOR = String.raw`(^|[^\w&-])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])`;
const COLOR_FUNCTION = String.raw`\b(rgba?|hsla?|hwb|oklab|oklch)\(`;
const LITERAL_COLOR_MESSAGE =
  "Couleur littérale : utilisez un token sémantique (classe Tailwind ou var(--color-…)).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/styles/tokens/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          `Literal[value=/${HEX_COLOR}/]`,
          `TemplateElement[value.raw=/${HEX_COLOR}/]`,
          `Literal[value=/${COLOR_FUNCTION}/]`,
          `TemplateElement[value.raw=/${COLOR_FUNCTION}/]`,
        ].map((selector) => ({ selector, message: LITERAL_COLOR_MESSAGE })),
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // Service worker généré par `pnpm build` (scripts/build-sw.mts).
    "public/sw.js",
    // Rapports et état des tests de bout en bout (générés, non versionnés).
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".e2e/**",
  ]),
]);

export default eslintConfig;
