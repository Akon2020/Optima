import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  expandOrderLine,
  formulaIssue,
  formulaMaxQuantity,
  optionChoiceIssue,
  optionGroupsIssue,
  splitFormulaPrice,
} from "./menu-options";
import type { Availability } from "./menu";
import type { MenuItem, OptionGroup } from "./types";

const fc = (major: number) => moneyFromMajor(major, "CDF");

const item = (id: string, overrides: Partial<MenuItem> = {}): MenuItem => ({
  id,
  establishmentId: "e",
  servicePointId: "sp-kitchen",
  name: id,
  description: "",
  category: "",
  unit: "dish",
  price: fc(10_000),
  createdAt: "2026-11-01T06:00:00.000Z",
  archivedAt: null,
  ...overrides,
});

const sides: OptionGroup = {
  id: "g-side",
  name: "Accompagnement",
  isRequired: true,
  isMultiple: false,
  options: [
    { id: "o-fries", name: "Frites", priceDelta: fc(0) },
    { id: "o-plantain", name: "Bananes plantains", priceDelta: fc(1_000) },
  ],
};
const sauces: OptionGroup = {
  id: "g-sauce",
  name: "Sauces",
  isRequired: false,
  isMultiple: true,
  options: [
    { id: "o-pili", name: "Pili-pili", priceDelta: fc(0) },
    { id: "o-mayo", name: "Mayonnaise", priceDelta: fc(500) },
  ],
};

const tilapia = item("tilapia", {
  name: "Tilapia",
  price: fc(15_000),
  optionGroups: [sides, sauces],
});
const primus = item("primus", {
  name: "Primus",
  servicePointId: "sp-counter",
  unit: "bottle",
  price: fc(3_500),
});
const fries = item("fries", { name: "Frites", price: fc(4_000) });
const formula = item("menu", {
  name: "Formule tilapia",
  kind: "formula",
  price: fc(20_000),
  components: ["tilapia", "primus"],
});
const items = new Map([tilapia, primus, fries, formula].map((entry) => [entry.id, entry]));

describe("options (D-035, D-060)", () => {
  it("contrôle les groupes saisis par le gérant", () => {
    expect(optionGroupsIssue([sides, sauces])).toBeNull();
    expect(optionGroupsIssue([{ ...sides, options: [] }])?.code).toBe("OPTIONS_REQUIRED");
    expect(
      optionGroupsIssue([{ ...sides, options: [{ id: "x", name: "Riz", priceDelta: fc(-500) }] }])
        ?.code,
    ).toBe("INVALID_SUPPLEMENT");
  });

  it("exige les groupes obligatoires et respecte le choix unique", () => {
    expect(optionChoiceIssue(tilapia, [])?.code).toBe("OPTION_REQUIRED");
    expect(optionChoiceIssue(tilapia, ["o-fries", "o-plantain"])?.code).toBe("SINGLE_OPTION");
    expect(optionChoiceIssue(tilapia, ["o-fries", "o-pili", "o-mayo"])).toBeNull();
    expect(optionChoiceIssue(tilapia, ["o-inconnue"])?.code).toBe("UNKNOWN_OPTION");
  });

  it("ajoute les suppléments au prix figé de la ligne", () => {
    const result = expandOrderLine(
      { menuItemId: "tilapia", quantity: 2, optionIds: ["o-plantain", "o-mayo"] },
      items,
      "l1",
    );
    expect(result).toMatchObject({
      ok: true,
      lines: [
        {
          menuItemId: "tilapia",
          unitPrice: fc(16_500),
          quantity: 2,
          options: [
            { groupName: "Accompagnement", name: "Bananes plantains", priceDelta: fc(1_000) },
            { groupName: "Sauces", name: "Mayonnaise", priceDelta: fc(500) },
          ],
        },
      ],
    });
  });
});

describe("formules (D-035, D-060)", () => {
  it("répartit le prix entre les composants, par centaines de francs (D-042)", () => {
    // 20 000 réparti sur 15 000 et 3 500 : 16 216,2 et 3 783,8, soit 16 200 et 3 800.
    expect(splitFormulaPrice(fc(20_000), [fc(15_000), fc(3_500)])).toEqual([fc(16_200), fc(3_800)]);
    // Prix qui ne tombent pas sur la centaine : francs entiers.
    expect(splitFormulaPrice(fc(20_050), [fc(15_000), fc(3_500)])).toEqual([fc(16_257), fc(3_793)]);
    const shares = splitFormulaPrice(fc(10_000), [fc(3_000), fc(3_000), fc(3_000)]);
    expect(shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(1_000_000);
  });

  it("envoie chaque composant à son point de service, avec sa part du prix", () => {
    const result = expandOrderLine({ menuItemId: "menu", quantity: 2 }, items, "l1");
    expect(result).toMatchObject({
      ok: true,
      lines: [
        { menuItemId: "tilapia", servicePointId: "sp-kitchen", unitPrice: fc(16_200), quantity: 2 },
        { menuItemId: "primus", servicePointId: "sp-counter", unitPrice: fc(3_800), quantity: 2 },
      ],
    });
    if (result.ok) {
      expect(result.lines.every((line) => line.formula?.name === "Formule tilapia")).toBe(true);
    }
  });

  it("refuse une formule trop petite, imbriquée ou dont un composant n'a pas de prix", () => {
    expect(formulaIssue(["tilapia"], items)?.code).toBe("FORMULA_SIZE");
    expect(formulaIssue(["tilapia", "menu"], items)?.code).toBe("NESTED_FORMULA");
    const noPrice = new Map(items).set("fries", { ...fries, price: null });
    expect(formulaIssue(["tilapia", "fries"], noPrice)?.code).toBe("COMPONENT_PRICE_NOT_SET");
  });

  it("le composant le plus rare limite la formule", () => {
    const availability = new Map<string, Availability>([
      ["tilapia", { status: "available" as const, remaining: 10 }],
      ["primus", { status: "low" as const, remaining: 3 }],
    ]);
    expect(formulaMaxQuantity(["tilapia", "primus"], availability)).toBe(3);
    expect(formulaMaxQuantity(["primus", "primus"], availability)).toBe(1);
    expect(
      formulaMaxQuantity(
        ["tilapia", "primus"],
        new Map([...availability, ["primus", { status: "sold-out" as const, remaining: 0 }]]),
      ),
    ).toBe(0);
  });
});
