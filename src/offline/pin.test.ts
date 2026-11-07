import { describe, expect, it } from "vitest";

import { checkPinPolicy, createPinVerifier, verifyPin } from "./pin";

describe("code PIN (EF-AUT-05)", () => {
  it("vérifie le bon code et refuse les autres, sans stocker le code", async () => {
    const verifier = await createPinVerifier("2580");
    expect(JSON.stringify(verifier)).not.toContain("2580");
    expect(await verifyPin("2580", verifier)).toBe(true);
    expect(await verifyPin("2581", verifier)).toBe(false);
  });

  it("produit un vérificateur différent pour le même code (sel aléatoire)", async () => {
    const a = await createPinVerifier("2580");
    const b = await createPinVerifier("2580");
    expect(a.hash).not.toBe(b.hash);
  });

  it("refuse un code mal formé ou trop facile", () => {
    expect(checkPinPolicy("123")).toMatch(/4 chiffres/);
    expect(checkPinPolicy("12a4")).toMatch(/4 chiffres/);
    expect(checkPinPolicy("7777")).toMatch(/répété/);
    expect(checkPinPolicy("1234")).toMatch(/suite/);
    expect(checkPinPolicy("4321")).toMatch(/suite/);
    expect(checkPinPolicy("2580")).toBeNull();
  });
});
