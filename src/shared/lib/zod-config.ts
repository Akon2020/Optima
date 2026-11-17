import { z } from "zod";

/**
 * CSP sans `eval` (CLAUDE.md § 5.4) : par défaut, Zod 4 tente
 * `Function("")` pour accélérer ses validations, ce que la CSP refuse (avec un
 * rapport de violation à chaque page). En mode `jitless`, il ne le tente
 * jamais. À importer en tête de chaque fichier de schémas utilisé dans le
 * navigateur, avant toute validation.
 */
z.config({ jitless: true });
