/**
 * Fiche d'un établissement (EF-ETB-01, EF-ETB-02). Fonctions pures.
 */

export type EstablishmentIdentity = {
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
};

/**
 * Identifiant public de l'établissement dans les adresses (`/e/<slug>`) :
 * minuscules sans accents, chiffres et tirets. Il ne change plus ensuite,
 * car les appareils appairés le conservent.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Adresses réservées : elles masqueraient une page de l'application. */
export const RESERVED_SLUGS = new Set(["demo", "proprietaire", "connexion", "compte", "api"]);

/**
 * EF-ETB-02 : champs de l'en-tête imprimé encore manquants. Le logo attend
 * le stockage des fichiers (D-Q23) : il est signalé à part.
 */
export function missingHeaderFields(identity: EstablishmentIdentity): string[] {
  const missing: string[] = [];
  if (!identity.legalName) missing.push("Raison sociale");
  if (!identity.address) missing.push("Adresse");
  if (!identity.phone) missing.push("Téléphone");
  return missing;
}
