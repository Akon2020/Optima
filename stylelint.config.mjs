/**
 * Stylelint (CLAUDE.md § 4.2, D-067) : les couleurs littérales ne vivent que
 * dans les tokens (`src/styles/tokens/`) et les chartes de module
 * (`src/styles/modules/`). Partout ailleurs, une couleur passe par une
 * variable (`var(--color-…)`), donc suit les thèmes clair et sombre.
 *
 * Seules les règles intégrées à Stylelint sont utilisées : pas de jeu de
 * règles tiers, qui buterait sur la syntaxe de Tailwind CSS v4 (@theme,
 * @custom-variant, @utility).
 */
const LITERAL_COLOR_FUNCTIONS = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
];

/** @type {import("stylelint").Config} */
const config = {
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  rules: {
    "color-no-invalid-hex": true,
    "color-no-hex": [true, { message: "Couleur littérale : utilisez un token (var(--color-…))." }],
    "color-named": ["never", { message: "Couleur nommée : utilisez un token (var(--color-…))." }],
    "function-disallowed-list": [
      LITERAL_COLOR_FUNCTIONS,
      { message: "Couleur littérale : utilisez un token (var(--color-…))." },
    ],
    "declaration-block-no-duplicate-properties": true,
    "no-duplicate-selectors": true,
  },
  overrides: [
    {
      // Les tokens et les chartes de module définissent les couleurs.
      files: ["src/styles/tokens/**/*.css", "src/styles/modules/**/*.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null,
      },
    },
  ],
  ignoreFiles: [
    ".next/**",
    "node_modules/**",
    "public/**",
    "src/generated/**",
    "**/*.ts",
    "**/*.tsx",
  ],
};

export default config;
