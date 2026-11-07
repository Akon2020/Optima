import { describe, expect, it } from "vitest";

import { SLUG_PATTERN, missingHeaderFields, slugify } from "./establishment";

describe("adresse d'un établissement", () => {
  it("retire les accents, la ponctuation et limite la longueur", () => {
    expect(slugify("Restaurant Best Food I")).toBe("restaurant-best-food-i");
    expect(slugify("  Gold Detector M Congo — Bukavu ")).toBe("gold-detector-m-congo-bukavu");
    expect(slugify("Été à Goma")).toBe("ete-a-goma");
    expect(slugify("x".repeat(60))).toHaveLength(40);
    expect(SLUG_PATTERN.test(slugify("Restaurant Best Food I"))).toBe(true);
    expect(SLUG_PATTERN.test("-abc")).toBe(false);
  });
});

describe("aperçu de l'en-tête (EF-ETB-02)", () => {
  it("signale les champs manquants", () => {
    expect(
      missingHeaderFields({ name: "Best Food I", legalName: null, address: "Bukavu", phone: null }),
    ).toEqual(["Raison sociale", "Téléphone"]);
    expect(
      missingHeaderFields({
        name: "Best Food I",
        legalName: "Best Food SARL",
        address: "Bukavu",
        phone: "+243990000000",
      }),
    ).toEqual([]);
  });
});
