import { describe, expect, it } from "vitest";

import { expectedStockOf } from "./closing";
import { proposeMorningQuantity } from "./morning-stock";
import {
  firstMorningEntryAt,
  laterRequisitioned,
  morningRequisitioned,
  requisitionKind,
  validateRequisition,
} from "./requisition";
import type { Requisition } from "./types";

const DAY = "2026-11-17";
const POINT = "point-comptoir";

function requisition(
  kind: Requisition["kind"],
  lines: [string, number][],
  day = DAY,
): Pick<Requisition, "day" | "kind" | "lines"> {
  return {
    day,
    kind,
    lines: lines.map(([menuItemId, quantity]) => ({
      menuItemId,
      name: menuItemId,
      unit: "bottle",
      quantity,
    })),
  };
}

describe("requisitionKind (D-069)", () => {
  it("avant le stock du matin : réquisition principale", () => {
    expect(
      requisitionKind({
        isReturn: false,
        createdAt: "2026-11-17T06:00:00Z",
        morningEnteredAt: null,
      }),
    ).toBe("main");
    expect(
      requisitionKind({
        isReturn: false,
        createdAt: "2026-11-17T06:00:00Z",
        morningEnteredAt: "2026-11-17T06:30:00Z",
      }),
    ).toBe("main");
  });

  it("après le stock du matin : complément ; un retour reste un retour", () => {
    expect(
      requisitionKind({
        isReturn: false,
        createdAt: "2026-11-17T12:00:00Z",
        morningEnteredAt: "2026-11-17T06:30:00Z",
      }),
    ).toBe("complement");
    expect(
      requisitionKind({
        isReturn: true,
        createdAt: "2026-11-17T06:00:00Z",
        morningEnteredAt: null,
      }),
    ).toBe("return");
  });

  it("la première saisie du point et du jour fait foi", () => {
    const entries = [
      { day: DAY, servicePointId: POINT, enteredAt: "2026-11-17T07:00:00Z" },
      { day: DAY, servicePointId: POINT, enteredAt: "2026-11-17T06:40:00Z" },
      { day: DAY, servicePointId: "autre", enteredAt: "2026-11-17T05:00:00Z" },
      { day: "2026-11-16", servicePointId: POINT, enteredAt: "2026-11-16T05:00:00Z" },
    ];
    expect(firstMorningEntryAt(entries, POINT, DAY)).toBe("2026-11-17T06:40:00Z");
    expect(firstMorningEntryAt(entries, POINT, "2026-11-18")).toBeNull();
  });
});

describe("quantités réquisitionnées (EF-REQ-04, EF-CLO-03)", () => {
  const requisitions = [
    requisition("main", [["primus", 48]]),
    requisition("main", [
      ["primus", 12],
      ["fanta", 24],
    ]),
    requisition("complement", [["primus", 24]]),
    requisition("return", [["primus", 6]]),
    requisition("main", [["primus", 99]], "2026-11-16"),
  ];

  it("les principales du jour entrent dans la proposition du matin", () => {
    const morning = morningRequisitioned(requisitions, DAY);
    expect(morning.get("primus")).toBe(60);
    expect(morning.get("fanta")).toBe(24);
    expect(
      proposeMorningQuantity({
        previousMorning: null,
        previousSold: 0,
        previousCounted: 10,
        requisitioned: morning.get("primus") ?? null,
      }),
    ).toBe(70);
  });

  it("compléments moins retours s'ajoutent au stock attendu à la clôture", () => {
    const later = laterRequisitioned(requisitions, DAY);
    expect(later.get("primus")).toBe(18);
    expect(later.has("fanta")).toBe(false);
    expect(expectedStockOf({ morning: 70, requisitioned: 18, sold: 50 })).toBe(38);
    // Comptage enregistré avant les réquisitions : pas de champ, compté pour 0.
    expect(expectedStockOf({ morning: 70, sold: 50 })).toBe(20);
  });
});

describe("validateRequisition (RG-REQ-01)", () => {
  const allowedItems = new Map([
    ["primus", { name: "Primus 72 cl" }],
    ["fanta", { name: "Fanta" }],
  ]);

  it("accepte une réquisition correcte", () => {
    expect(
      validateRequisition({
        isReturn: false,
        lines: [{ menuItemId: "primus", quantity: 48 }],
        comment: null,
        allowedItems,
      }),
    ).toEqual([]);
  });

  it("refuse une réquisition vide, un élément étranger, un doublon ou une quantité invalide", () => {
    const codes = (lines: { menuItemId: string; quantity: number }[]) =>
      validateRequisition({ isReturn: false, lines, comment: null, allowedItems }).map(
        (issue) => issue.code,
      );
    expect(codes([])).toEqual(["EMPTY_REQUISITION"]);
    expect(codes([{ menuItemId: "tilapia", quantity: 2 }])).toEqual(["ITEM_NOT_FOUND"]);
    expect(
      codes([
        { menuItemId: "primus", quantity: 2 },
        { menuItemId: "primus", quantity: 3 },
      ]),
    ).toEqual(["DUPLICATE_ITEM"]);
    expect(codes([{ menuItemId: "fanta", quantity: 0 }])).toEqual(["INVALID_QUANTITY"]);
    expect(codes([{ menuItemId: "fanta", quantity: 1.5 }])).toEqual(["INVALID_QUANTITY"]);
  });

  it("exige un motif pour un retour au magasin", () => {
    const lines = [{ menuItemId: "primus", quantity: 6 }];
    expect(
      validateRequisition({ isReturn: true, lines, comment: " ", allowedItems }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["REASON_REQUIRED"]);
    expect(
      validateRequisition({ isReturn: true, lines, comment: "Erreur de saisie", allowedItems }),
    ).toEqual([]);
  });
});
