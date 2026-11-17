import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { operatingDayOf } from "./business-day";
import { adjustmentIssue, periodIssue, summarizePeriod } from "./period";

const fc = (major: number) => moneyFromMajor(major, "CDF");
const TZ = "Africa/Lubumbashi";

describe("journée d'une vente (D-039)", () => {
  it("une vente qui suit la validation passe à la journée suivante", () => {
    const validated = new Map([["2026-11-07", "2026-11-07T19:00:00.000Z"]]);
    expect(operatingDayOf("2026-11-07T18:00:00.000Z", validated, 6, TZ)).toBe("2026-11-07");
    expect(operatingDayOf("2026-11-07T20:00:00.000Z", validated, 6, TZ)).toBe("2026-11-08");
    expect(operatingDayOf("2026-11-08T09:00:00.000Z", validated, 6, TZ)).toBe("2026-11-08");
  });
});

describe("clôture de période (EF-CLO-05, D-064)", () => {
  const validated = new Set(["2026-11-03", "2026-11-04", "2026-11-06"]);
  const base = { validatedDays: validated, periods: [] };

  it("exige des journées validées, ignore les journées sans activité", () => {
    // Le 05 n'a eu aucune activité (restaurant fermé) : il ne bloque pas.
    expect(
      periodIssue({ ...base, from: "2026-11-03", to: "2026-11-06", activeDays: new Set() }),
    ).toBeNull();
    expect(
      periodIssue({
        ...base,
        from: "2026-11-03",
        to: "2026-11-06",
        activeDays: new Set(["2026-11-05"]),
      })?.code,
    ).toBe("DAY_NOT_VALIDATED");
    expect(
      periodIssue({ ...base, from: "2026-11-06", to: "2026-11-03", activeDays: new Set() })?.code,
    ).toBe("INVALID_RANGE");
    expect(
      periodIssue({ ...base, from: "2026-11-01", to: "2026-11-02", activeDays: new Set() })?.code,
    ).toBe("EMPTY_PERIOD");
  });

  it("refuse une période qui recoupe une période clôturée", () => {
    expect(
      periodIssue({
        ...base,
        periods: [{ fromDay: "2026-11-01", toDay: "2026-11-03" }],
        from: "2026-11-03",
        to: "2026-11-06",
        activeDays: new Set(),
      })?.code,
    ).toBe("PERIOD_OVERLAP");
  });

  it("résume ventes, caisse par personne, ajustements et écarts de stock", () => {
    const summary = summarizePeriod({
      from: "2026-11-03",
      to: "2026-11-04",
      currency: "CDF",
      validatedDays: ["2026-11-03", "2026-11-04", "2026-11-06"],
      invoices: [
        { day: "2026-11-03", total: fc(10_000), discount: fc(1_000), isCancelled: false },
        { day: "2026-11-04", total: fc(5_000), discount: fc(0), isCancelled: true },
        { day: "2026-11-06", total: fc(99_000), discount: fc(0), isCancelled: false },
      ],
      cashClosings: [
        {
          day: "2026-11-03",
          userId: "amani",
          userName: "Amani",
          lines: [{ expected: fc(9_000), counted: fc(7_000) }],
        },
        {
          day: "2026-11-04",
          userId: "neema",
          userName: "Neema",
          lines: [{ expected: fc(4_000), counted: fc(4_000) }],
        },
      ],
      cashAdjustments: [{ day: "2026-11-03", userId: "amani", userName: "Amani", amount: fc(500) }],
      stockLines: [
        {
          day: "2026-11-03",
          servicePointId: "sp",
          servicePointName: "Comptoir",
          menuItemId: "primus",
          name: "Primus 72 cl",
          unit: "bottle",
          morning: 48,
          sold: 10,
          declaredOut: 1,
          counted: 35,
        },
      ],
      stockAdjustments: [
        { day: "2026-11-03", servicePointId: "sp", menuItemId: "primus", quantity: 1 },
      ],
      debtsOutstanding: fc(4_000),
    });
    expect(summary.revenue).toEqual(fc(9_000));
    expect(summary.cancelled).toEqual({ count: 1, amount: fc(5_000) });
    expect(summary.validatedDays).toEqual(["2026-11-03", "2026-11-04"]);
    // Amani : 7 000 comptés + 500 retrouvés − 9 000 attendus = −1 500 (manquant nommé).
    expect(summary.people[0]).toMatchObject({ userName: "Amani", variance: fc(-1_500) });
    expect(summary.cash).toEqual([
      {
        currency: "CDF",
        expected: fc(13_000),
        counted: fc(11_000),
        adjusted: fc(500),
        variance: fc(-1_500),
      },
    ]);
    // Primus : attendu 48 − 10 − 1 = 37, compté 35, corrigé de +1 : −1.
    expect(summary.stock).toEqual([
      {
        servicePointName: "Comptoir",
        name: "Primus 72 cl",
        unit: "bottle",
        sold: 10,
        declaredOut: 1,
        variance: -1,
      },
    ]);
    expect(summary.adjustmentCount).toBe(2);
    expect(summary.pending.map((entry) => entry.label)).toEqual(["Bénéfice", "Dépenses"]);
  });
});

describe("écritures d'ajustement (RG-CLO-02, D-064)", () => {
  const input = {
    day: "2026-11-03",
    reason: "Billet retrouvé sous le comptoir",
    value: 50_000,
    validatedDays: new Set(["2026-11-03"]),
    periods: [],
  };

  it("ne corrige qu'une journée validée et hors période clôturée, avec un motif", () => {
    expect(adjustmentIssue(input)).toBeNull();
    expect(adjustmentIssue({ ...input, day: "2026-11-04" })?.code).toBe("DAY_NOT_VALIDATED");
    expect(
      adjustmentIssue({ ...input, periods: [{ fromDay: "2026-11-01", toDay: "2026-11-07" }] })
        ?.code,
    ).toBe("PERIOD_CLOSED");
    expect(adjustmentIssue({ ...input, value: 0 })?.code).toBe("INVALID_VALUE");
    expect(adjustmentIssue({ ...input, reason: "x" })?.code).toBe("REASON_REQUIRED");
  });
});
