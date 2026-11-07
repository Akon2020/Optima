import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  computeAvailability,
  formatQuantity,
  isOrderable,
  matchesSearch,
  maxOrderableQuantity,
  sortByPopularity,
} from "./menu";

const priced = { price: moneyFromMajor(3000, "CDF") };

describe("disponibilité des éléments de menu", () => {
  it("RG-PRX-01 : un élément sans prix ne se vend pas", () => {
    const availability = computeAvailability({ price: null }, 10, 0, 3);
    expect(availability.status).toBe("no-price");
    expect(isOrderable(availability)).toBe(false);
  });

  it("RG-REQ-03 : sans stock du matin, la commande reste possible", () => {
    const availability = computeAvailability(priced, null, 4, 3);
    expect(availability.status).toBe("unknown-stock");
    expect(isOrderable(availability)).toBe(true);
    expect(maxOrderableQuantity(availability)).toBeNull();
  });

  it("RG-RES-01 : stock du jour à zéro, l'élément est épuisé", () => {
    const availability = computeAvailability(priced, 12, 12, 3);
    expect(availability).toEqual({ status: "sold-out", remaining: 0 });
    expect(isOrderable(availability)).toBe(false);
  });

  it("RG-STK-03 : un reste négatif est traité comme épuisé", () => {
    expect(computeAvailability(priced, 2, 3, 3).status).toBe("sold-out");
  });

  it("signale un stock faible sous le seuil paramétré", () => {
    const availability = computeAvailability(priced, 10, 8, 3);
    expect(availability).toEqual({ status: "low", remaining: 2 });
    expect(maxOrderableQuantity(availability)).toBe(2);
  });
});

describe("menus", () => {
  it("EF-CMD-01 : les plus vendus apparaissent en premier", () => {
    const items = [
      { id: "a", name: "Tilapia" },
      { id: "b", name: "Frites" },
      { id: "c", name: "Bière" },
    ];
    const sorted = sortByPopularity(
      items,
      new Map([
        ["b", 9],
        ["c", 9],
        ["a", 1],
      ]),
    );
    expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("EF-CAT-05 : la recherche ignore les accents et la casse", () => {
    expect(matchesSearch("Poisson salé", "SALE")).toBe(true);
    expect(matchesSearch("Bière", "biere")).toBe(true);
    expect(matchesSearch("Foufou", "")).toBe(true);
    expect(matchesSearch("Foufou", "porc")).toBe(false);
  });

  it("EF-RES-03 : affiche la quantité dans l'unité de vente", () => {
    expect(formatQuantity(1, "bottle")).toBe("1 bouteille");
    expect(formatQuantity(3, "piece")).toBe("3 morceaux");
  });
});
