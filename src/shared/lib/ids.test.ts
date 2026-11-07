import { describe, expect, it } from "vitest";

import { uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("produit un UUID version 7 valide", () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("est triable par date de création", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it("RG-OFF-01 : ne produit pas de doublon", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });
});
