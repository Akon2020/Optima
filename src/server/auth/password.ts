import { randomInt } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

/**
 * Mots de passe (ENF-07, RG-AUT-01, EF-AUT-02) : Argon2id, jamais stockés ni
 * envoyés en clair. Paramètres conformes aux recommandations OWASP.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Empreinte factice : vérifiée quand l'identifiant est inconnu, pour que la
 * durée de réponse ne révèle pas l'existence d'un compte.
 */
let dummyHash: Promise<string> | undefined;
export function verifyAgainstDummy(password: string): Promise<boolean> {
  dummyHash ??= hashPassword("optima-mot-de-passe-factice");
  return dummyHash.then((value) => verifyPassword(value, password));
}

/** Contrôle d'un nouveau mot de passe ; renvoie le message d'erreur ou `null`. */
export function checkPasswordPolicy(password: string, context: string[] = []): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`;
  }
  if (new Set(password).size < 4) {
    return "Ce mot de passe est trop répétitif : variez les caractères.";
  }
  const lower = password.toLowerCase();
  if (context.some((value) => value.length >= 4 && lower.includes(value.toLowerCase()))) {
    return "Le mot de passe ne doit pas contenir votre nom ni votre identifiant.";
  }
  return null;
}

// Sans caractères ambigus (0/O, 1/l/I) : lisible à l'oral et sur papier.
const READABLE = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Mot de passe provisoire lisible (EF-AUT-02), par exemple « Kp7m-Qx3r-Ht9w ». */
export function generateTemporaryPassword(groups = 3, groupLength = 4): string {
  return Array.from({ length: groups }, () =>
    Array.from({ length: groupLength }, () => READABLE[randomInt(READABLE.length)]).join(""),
  ).join("-");
}
