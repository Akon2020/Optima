import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { computeCashVariance, computeExpectedStock } from "./closing";

describe("clôture de service", () => {
  it("EF-CLO-02 : un manquant est un écart négatif et exige un commentaire", () => {
    const result = computeCashVariance(
      moneyFromMajor(120000, "CDF"),
      moneyFromMajor(115000, "CDF"),
    );
    expect(result.kind).toBe("shortage");
    expect(result.variance.amountMinor).toBe(-500_000);
    expect(result.requiresComment).toBe(true);
  });

  it("EF-CLO-02 : un excédent est un écart positif", () => {
    const result = computeCashVariance(moneyFromMajor(1000, "CDF"), moneyFromMajor(1500, "CDF"));
    expect(result.kind).toBe("surplus");
  });

  it("EF-CLO-02 : une caisse juste n'exige pas de commentaire", () => {
    const result = computeCashVariance(moneyFromMajor(5000, "CDF"), moneyFromMajor(5000, "CDF"));
    expect(result).toMatchObject({ kind: "balanced", requiresComment: false });
  });

  it("EF-CLO-03 : stock attendu = matin + réquisitions − ventes", () => {
    expect(computeExpectedStock({ morning: 24, requisitioned: 12, sold: 30 })).toBe(6);
  });
});
