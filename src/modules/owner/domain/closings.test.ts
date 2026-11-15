import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { cashTotals, periodDayKeys, summarizeClosings, type CashClosingRow } from "./closings";
import { periodRange } from "./overview";

const TZ = "Africa/Lubumbashi";
const NOW = "2026-11-07T13:00:00.000Z";
const fc = (major: number) => moneyFromMajor(major, "CDF");
const usd = (major: number) => moneyFromMajor(major, "USD");

const closing = (
  day: string,
  userName: string,
  lines: CashClosingRow["lines"],
  establishmentId = "e1",
): CashClosingRow => ({ establishmentId, day, userName, lines, comment: null });

describe("journées d'une période", () => {
  it("donne une clé par journée d'exploitation", () => {
    expect(periodDayKeys(periodRange("semaine", NOW, TZ), TZ)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });
});

describe("clôtures dans l'espace propriétaire (EF-CLO-04, EF-PRO-01, RG-CLO-01)", () => {
  const dayKeys = ["2026-11-05", "2026-11-06", "2026-11-07"];
  const cashClosings = [
    closing("2026-11-06", "Amani K.", [
      { expectedMinor: 10_800_000, countedMinor: 10_600_000, currency: "CDF" },
      { expectedMinor: 2_000, countedMinor: 2_000, currency: "USD" },
    ]),
    closing("2026-11-06", "Neema B.", [
      { expectedMinor: 5_000_000, countedMinor: 5_100_000, currency: "CDF" },
    ]),
    closing("2026-11-01", "Hors période", [
      { expectedMinor: 1_000_000, countedMinor: 0, currency: "CDF" },
    ]),
    closing(
      "2026-11-06",
      "Autre établissement",
      [{ expectedMinor: 1_000_000, countedMinor: 0, currency: "CDF" }],
      "e2",
    ),
  ];

  const summary = summarizeClosings({
    establishmentId: "e1",
    dayKeys,
    todayKey: "2026-11-07",
    cashClosings,
    validatedDays: [{ establishmentId: "e1", day: "2026-11-06" }],
    activeDays: new Set(["2026-11-05", "2026-11-06", "2026-11-07"]),
    lastValidatedDay: "2026-11-06",
  });

  it("additionne l'attendu et le déclaré par devise, sans compenser un manquant par un excédent", () => {
    expect(summary.cash).toEqual([
      { currency: "CDF", expected: fc(158_000), counted: fc(157_000), shortage: fc(2_000) },
      { currency: "USD", expected: usd(20), counted: usd(20), shortage: usd(0) },
    ]);
  });

  it("nomme chaque manquant", () => {
    expect(summary.shortages).toEqual([
      {
        establishmentId: "e1",
        day: "2026-11-06",
        userName: "Amani K.",
        amount: fc(2_000),
        comment: null,
      },
    ]);
  });

  it("signale les journées passées non validées, pas la journée en cours", () => {
    expect(summary.unvalidatedDays).toEqual(["2026-11-05"]);
    expect(summary.validatedDays).toBe(1);
  });

  it("totalise par devise entre établissements", () => {
    const other = summarizeClosings({
      establishmentId: "e2",
      dayKeys,
      todayKey: "2026-11-07",
      cashClosings,
      validatedDays: [],
      activeDays: new Set(),
      lastValidatedDay: null,
    });
    expect(cashTotals([summary, other])[0]).toEqual({
      currency: "CDF",
      expected: fc(168_000),
      counted: fc(157_000),
      shortage: fc(12_000),
    });
  });
});
