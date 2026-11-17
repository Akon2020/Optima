import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, sha256 } from "./crypto";
import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "./password";
import { normalizeIdentifier } from "./policy";
import { base32Decode, base32Encode, generateRecoveryCodes, totpCode, verifyTotp } from "./totp";

describe("mots de passe (ENF-07, EF-AUT-02)", () => {
  it("hache en Argon2id et vérifie", async () => {
    const hash = await hashPassword("Une phrase solide 2026");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Une phrase solide 2026")).toBe(true);
    expect(await verifyPassword(hash, "une phrase solide 2026")).toBe(false);
  });

  it("refuse un mot de passe trop court, répétitif ou contenant le nom", () => {
    expect(checkPasswordPolicy("court")).toMatch(/10 caractères/);
    expect(checkPasswordPolicy("aaaaaaaaaaaa")).toMatch(/répétitif/);
    expect(checkPasswordPolicy("amani-2026-bukavu", ["Amani"])).toMatch(/nom/);
    expect(checkPasswordPolicy("Une phrase solide 2026")).toBeNull();
  });

  it("génère des mots de passe provisoires lisibles, sans caractères ambigus", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(password).not.toMatch(/[01OIl]/);
  });
});

describe("double authentification TOTP (EF-AUT-03)", () => {
  // Vecteur de test de la RFC 6238 (SHA-1) : secret ASCII « 12345678901234567890 ».
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("respecte la RFC 6238", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1_111_111_109_000)).toBe("081804");
  });

  it("tolère une période de décalage et refuse au-delà", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });

  it("encode et décode le base32", () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("génère 8 codes de secours uniques", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });
});

describe("chiffrement des secrets", () => {
  it("chiffre en AES-256-GCM et refuse une clé différente", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("SECRET-TOTP", key);
    expect(encrypted).not.toContain("SECRET");
    expect(decryptSecret(encrypted, key)).toBe("SECRET-TOTP");
    expect(() => decryptSecret(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });

  it("produit une empreinte SHA-256 stable", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("identifiant de connexion (EF-AUT-01)", () => {
  it("accepte un e-mail ou un numéro de téléphone", () => {
    expect(normalizeIdentifier(" Gerant@Exemple.CD ")).toEqual({
      kind: "email",
      value: "gerant@exemple.cd",
    });
    expect(normalizeIdentifier("+243 970 000 000")).toEqual({
      kind: "phone",
      value: "+243970000000",
    });
    expect(normalizeIdentifier("bonjour")).toBeNull();
  });
});
