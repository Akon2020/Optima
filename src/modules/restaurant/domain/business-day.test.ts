import { describe, expect, it } from "vitest";

import {
  businessDayKey,
  businessDayStart,
  businessDayStartOf,
  currentDayKey,
  isInBusinessDay,
  nextDayKey,
} from "./business-day";

// Bukavu : Africa/Lubumbashi, UTC+2 sans heure d'été.
describe("journée d'exploitation (D-039)", () => {
  it("commence à 6 h locales", () => {
    // 14 h 30 locales le 7 novembre = 12 h 30 UTC.
    expect(businessDayStart("2026-11-07T12:30:00.000Z")).toBe("2026-11-07T04:00:00.000Z");
  });

  it("un service prolongé après minuit reste dans la journée de la veille", () => {
    // 1 h 15 locale le 8 novembre = 23 h 15 UTC le 7.
    const now = "2026-11-07T23:15:00.000Z";
    expect(businessDayKey(now)).toBe("2026-11-07");
    expect(isInBusinessDay("2026-11-07T18:00:00.000Z", now)).toBe(true);
    expect(isInBusinessDay("2026-11-07T03:59:00.000Z", now)).toBe(false);
  });
});

describe("journée et clôture validée (D-039, D-056)", () => {
  it("retrouve le début d'une journée à partir de sa clé", () => {
    expect(businessDayStartOf("2026-11-07")).toBe("2026-11-07T04:00:00.000Z");
    expect(nextDayKey("2026-11-30")).toBe("2026-12-01");
  });

  it("rattache à la journée suivante ce qui suit une journée validée", () => {
    const lateEvening = "2026-11-07T21:30:00.000Z"; // 23 h 30 locales
    expect(currentDayKey(lateEvening, new Set())).toBe("2026-11-07");
    expect(currentDayKey(lateEvening, new Set(["2026-11-07"]))).toBe("2026-11-08");
  });
});
