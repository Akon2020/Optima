import { describe, expect, it } from "vitest";

import { ESTABLISHMENT_TYPES, activeDependents, missingDependencies } from "./registry";

describe("dépendances entre modules (RG-MOD-02)", () => {
  it("un module ne s'active pas sans ses dépendances", () => {
    expect(missingDependencies("preparation", new Set(["catalog"]))).toEqual(["restaurant"]);
    expect(missingDependencies("recipes", new Set(["restaurant"]))).toEqual(["stock"]);
    expect(missingDependencies("catalog", new Set())).toEqual([]);
  });

  it("un module dont d'autres dépendent ne se désactive pas tant qu'ils sont actifs", () => {
    const enabled = new Set([
      "catalog",
      "stock",
      "sales",
      "documents",
      "restaurant",
      "preparation",
    ]);
    expect(activeDependents("restaurant", enabled)).toEqual(["preparation"]);
    expect(activeDependents("stock", enabled)).toEqual(["restaurant"]);
    expect(activeDependents("preparation", enabled)).toEqual([]);
  });

  it("les modules par défaut d'un type d'établissement sont cohérents entre eux", () => {
    for (const type of ESTABLISHMENT_TYPES) {
      const enabled = new Set<string>(type.defaultModules);
      for (const moduleId of type.defaultModules) {
        expect(missingDependencies(moduleId, enabled)).toEqual([]);
      }
    }
  });
});
