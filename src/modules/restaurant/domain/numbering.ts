/**
 * Numérotation des documents (EF-DOC-01, RG-DOC-01).
 *
 * Format : TYPE-ANNÉE-CODEAPPAREIL-SÉQUENCE, par exemple FAC-2026-D01-000052.
 * Le code appareil rend le numéro unique même hors connexion : chaque appareil
 * tient ses propres compteurs, et un numéro attribué n'est jamais réutilisé.
 */

export type DocumentPrefix = "FAC" | "CMD";

const DEVICE_CODE = /^D\d{2,}$/;

export function formatDocumentNumber(input: {
  prefix: DocumentPrefix;
  year: number;
  deviceCode: string;
  sequence: number;
}): string {
  const { prefix, year, deviceCode, sequence } = input;
  if (!DEVICE_CODE.test(deviceCode)) {
    throw new Error(`Code appareil invalide : « ${deviceCode} » (attendu : D01, D02...).`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error(`Année invalide : ${year}.`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Séquence invalide : ${sequence}.`);
  }
  return `${prefix}-${year}-${deviceCode}-${String(sequence).padStart(6, "0")}`;
}

/** Clé du compteur local : un compteur par type de document, année et appareil. */
export function counterKey(prefix: DocumentPrefix, year: number, deviceCode: string): string {
  return `${prefix}:${year}:${deviceCode}`;
}
