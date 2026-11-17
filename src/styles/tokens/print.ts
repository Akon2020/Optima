/**
 * Couleurs des documents imprimés et des PDF (CLAUDE.md § 4.3 : toujours en
 * clair, quel que soit le thème). Elles reprennent la charte générale (bleu
 * nuit #1F3864) et l'encre des tickets. Seul endroit, avec les fichiers CSS
 * de ce dossier, où des couleurs littérales sont permises (§ 4.2).
 */
export const PRINT_TOKENS = {
  ink: "#111111",
  muted: "#4b5563",
  border: "#d1d5db",
  rowAlt: "#f3f4f6",
  brand: "#1f3864",
  onBrand: "#ffffff",
  paper: "#ffffff",
} as const;
