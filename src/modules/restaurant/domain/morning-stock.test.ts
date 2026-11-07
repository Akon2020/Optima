import { describe, expect, it } from "vitest";

import { hasPermission } from "../permissions";
import {
  currentEntries,
  isMorningStockComplete,
  morningVariance,
  proposeMorningQuantity,
  requiresReason,
  validateMorningLines,
} from "./morning-stock";
import type { MenuItem, MorningStockEntry } from "./types";

describe("proposition du stock du matin", () => {
  it("EF-REQ-04 : reste de la veille plus réquisition du jour", () => {
    expect(
      proposeMorningQuantity({ previousMorning: 48, previousSold: 30, requisitioned: 24 }),
    ).toBe(42);
  });

  it("sans réquisition connue, propose le reste de la veille (HYPOTHÈSE D-Q14)", () => {
    expect(
      proposeMorningQuantity({ previousMorning: 20, previousSold: 5, requisitioned: null }),
    ).toBe(15);
  });

  it("RG-STK-03 : un reste négatif est ramené à zéro", () => {
    expect(proposeMorningQuantity({ previousMorning: 2, previousSold: 3, requisitioned: 6 })).toBe(
      6,
    );
  });

  it("ne propose rien sans aucune base de calcul", () => {
    expect(
      proposeMorningQuantity({ previousMorning: null, previousSold: 0, requisitioned: null }),
    ).toBeNull();
  });

  it("calcule l'écart à la proposition", () => {
    expect(morningVariance(24, 22)).toBe(-2);
    expect(morningVariance(null, 22)).toBeNull();
  });
});

describe("motif obligatoire (RG-REQ-02)", () => {
  it("exige un motif si la saisie diffère de la proposition", () => {
    expect(requiresReason({ proposed: 24, quantity: 22, previous: null })).toBe(true);
    expect(requiresReason({ proposed: 24, quantity: 24, previous: null })).toBe(false);
    expect(requiresReason({ proposed: null, quantity: 10, previous: null })).toBe(false);
  });

  it("exige un motif pour corriger une saisie validée", () => {
    expect(requiresReason({ proposed: 24, quantity: 24, previous: 20 })).toBe(true);
    expect(requiresReason({ proposed: 24, quantity: 20, previous: 20 })).toBe(false);
  });

  it("refuse une saisie incomplète, invalide ou un écart non justifié", () => {
    const issues = validateMorningLines([
      { menuItemId: "a", name: "Primus", quantity: null, proposed: 10, previous: null, reason: "" },
      { menuItemId: "b", name: "Fanta", quantity: -1, proposed: null, previous: null, reason: "" },
      { menuItemId: "c", name: "Coca", quantity: 8, proposed: 10, previous: null, reason: " " },
      { menuItemId: "d", name: "Eau", quantity: 8, proposed: 10, previous: null, reason: "Casse" },
      { menuItemId: "e", name: "Sprite", quantity: 0, proposed: 0, previous: null, reason: "" },
    ]);
    expect(issues.map((issue) => [issue.menuItemId, issue.code])).toEqual([
      ["a", "QUANTITY_REQUIRED"],
      ["b", "INVALID_QUANTITY"],
      ["c", "REASON_REQUIRED"],
    ]);
  });
});

function entry(
  partial: Partial<MorningStockEntry> & Pick<MorningStockEntry, "id">,
): MorningStockEntry {
  return {
    establishmentId: "e",
    day: "2026-11-07",
    servicePointId: "sp",
    menuItemId: "a",
    quantity: 10,
    proposed: null,
    reason: null,
    replacesId: null,
    enteredAt: "2026-11-07T05:00:00.000Z",
    enteredBy: "u",
    enteredByName: "Gérant",
    ...partial,
  };
}

function item(id: string, price: number | null): MenuItem {
  return {
    id,
    establishmentId: "e",
    servicePointId: "sp",
    name: id,
    description: "",
    category: "",
    unit: "bottle",
    price: price === null ? null : { amountMinor: price, currency: "CDF" },
    createdAt: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
  };
}

describe("saisies en vigueur", () => {
  it("une correction remplace la saisie précédente sans l'effacer", () => {
    const current = currentEntries([
      entry({ id: "1", quantity: 10 }),
      entry({ id: "2", quantity: 12, replacesId: "1", enteredAt: "2026-11-07T06:00:00.000Z" }),
    ]);
    expect(current.get("a")?.quantity).toBe(12);
  });

  it("RG-REQ-03 : complet quand chaque élément vendable est saisi", () => {
    const items = [item("a", 100), item("b", 100), item("sans-prix", null)];
    const partial = currentEntries([entry({ id: "1", menuItemId: "a" })]);
    expect(isMorningStockComplete(items, "sp", partial)).toBe(false);
    const full = currentEntries([
      entry({ id: "1", menuItemId: "a" }),
      entry({ id: "2", menuItemId: "b" }),
    ]);
    expect(isMorningStockComplete(items, "sp", full)).toBe(true);
  });
});

describe("droits (matrice § 3)", () => {
  it("seul le gérant (ou le propriétaire) saisit le stock du matin", () => {
    expect(hasPermission("manager", "restaurant.morning-stock.enter")).toBe(true);
    expect(hasPermission("owner", "restaurant.morning-stock.enter")).toBe(true);
    expect(hasPermission("waiter", "restaurant.morning-stock.enter")).toBe(false);
    expect(hasPermission("prep", "restaurant.morning-stock.read")).toBe(true);
    expect(hasPermission("prep", "restaurant.morning-stock.enter")).toBe(false);
  });
});
