/**
 * Couleurs de la charte générale utilisées hors CSS : manifeste de
 * l'application installée, icônes et image de partage (CLAUDE.md § 4.1). Seul endroit, avec
 * les autres fichiers de ce dossier, où des couleurs littérales sont permises.
 */
export const BRAND_TOKENS = {
  /** Bleu nuit de la charte générale. */
  navy: "#1f3864",
  white: "#ffffff",
  /** Bleu nuit clair (`--navy-200`), texte secondaire de l'image de partage. */
  navyLight: "#b9c7e1",
  /** Fond du thème sombre (barre d'état du téléphone). */
  darkBackground: "#0b1220",
} as const;
