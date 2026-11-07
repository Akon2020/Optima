import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { linesTotal, splitOrderByServicePoint, validateCart } from "./order";
import type { OrderLine } from "./types";

const points = [
  { id: "counter", sortOrder: 1 },
  { id: "kitchen", sortOrder: 2 },
  { id: "grill", sortOrder: 3 },
];

function line(name: string, servicePointId: string, price: number, quantity: number): OrderLine {
  return {
    menuItemId: name,
    name,
    servicePointId,
    unit: "dish",
    unitPrice: moneyFromMajor(price, "CDF"),
    quantity,
  };
}

describe("répartition des commandes", () => {
  it("EF-CMD-02 : une facture d'avance par point de service concerné", () => {
    const split = splitOrderByServicePoint(
      [
        line("Chèvre", "grill", 4000, 2),
        line("Bière", "counter", 3000, 3),
        line("Frites", "kitchen", 2000, 1),
        line("Sucré", "counter", 1500, 2),
      ],
      points,
      "CDF",
    );

    expect(split.map((group) => group.servicePointId)).toEqual(["counter", "kitchen", "grill"]);
    expect(split[0]?.lines.map((l) => l.name)).toEqual(["Bière", "Sucré"]);
    expect(split[0]?.total.amountMinor).toBe(1_200_000);
    expect(split[2]?.total.amountMinor).toBe(800_000);
  });

  it("EF-CMD-02 : omet les points de service sans ligne", () => {
    const split = splitOrderByServicePoint([line("Bière", "counter", 3000, 1)], points, "CDF");
    expect(split).toHaveLength(1);
  });

  it("refuse une ligne rattachée à un point de service inconnu", () => {
    expect(() =>
      splitOrderByServicePoint([line("Bière", "bar-inconnu", 3000, 1)], points, "CDF"),
    ).toThrow(/Point de service inconnu/);
  });

  it("le total de la commande est la somme des factures", () => {
    const lines = [line("Bière", "counter", 3000, 3), line("Frites", "kitchen", 2000, 2)];
    const split = splitOrderByServicePoint(lines, points, "CDF");
    const sumOfSplits = split.reduce((sum, group) => sum + group.total.amountMinor, 0);
    expect(sumOfSplits).toBe(linesTotal(lines, "CDF").amountMinor);
  });
});

describe("validation du panier", () => {
  it("exige au moins une ligne et une table en salle", () => {
    expect(validateCart({ lines: [], mode: "dine-in", tableId: null }).map((i) => i.code)).toEqual([
      "EMPTY_CART",
      "TABLE_REQUIRED",
    ]);
  });

  it("EF-RES-04 : une vente à emporter n'exige pas de table", () => {
    expect(
      validateCart({ lines: [{ name: "Bière", quantity: 1 }], mode: "takeaway", tableId: null }),
    ).toEqual([]);
  });

  it("refuse une quantité non entière ou nulle", () => {
    const issues = validateCart({
      lines: [{ name: "Bière", quantity: 0 }],
      mode: "takeaway",
      tableId: null,
    });
    expect(issues).toEqual([{ code: "INVALID_QUANTITY", name: "Bière" }]);
  });
});
