/**
 * Code PIN à 4 chiffres d'un utilisateur sur un appareil partagé (EF-AUT-01,
 * EF-AUT-05, CLAUDE.md § 5.1).
 *
 * Le PIN n'existe que sur l'appareil où l'utilisateur s'est connecté avec son
 * mot de passe : il n'est jamais envoyé au serveur. Le vérificateur local est
 * dérivé par PBKDF2-SHA256 (WebCrypto, disponible hors connexion, sans
 * dépendance). Un PIN de 4 chiffres reste devinable par qui possède
 * l'appareil : la protection repose sur le verrouillage après 5 essais, qui
 * impose le mot de passe en ligne (D-024).
 */

export type PinVerifier = { salt: string; hash: string; iterations: number };

export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
const ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Contrôle d'un nouveau PIN ; renvoie le message d'erreur ou `null`. */
export function checkPinPolicy(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return `Le code doit comporter ${PIN_LENGTH} chiffres.`;
  }
  if (/^(\d)\1+$/.test(pin)) return "Évitez un code fait du même chiffre répété.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "Évitez une suite de chiffres comme 1234.";
  }
  return null;
}

export async function createPinVerifier(pin: string): Promise<PinVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return { salt: toBase64(salt), hash: toBase64(hash), iterations: ITERATIONS };
}

export async function verifyPin(pin: string, verifier: PinVerifier): Promise<boolean> {
  const hash = await derive(pin, fromBase64(verifier.salt), verifier.iterations);
  const expected = fromBase64(verifier.hash);
  if (hash.length !== expected.length) return false;
  // Comparaison sans sortie anticipée.
  let difference = 0;
  for (let index = 0; index < hash.length; index += 1) {
    difference |= (hash[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}
