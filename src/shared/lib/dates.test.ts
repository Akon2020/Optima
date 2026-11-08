import { describe, expect, it } from "vitest";

import { formatRelativeInstant, zonedDayStart } from "./dates";

describe("formatRelativeInstant (fuseau Africa/Lubumbashi)", () => {
  const now = "2026-11-07T14:00:00.000Z"; // 16:00 à Bukavu

  it("dit « à l'instant » sous une minute, puis les minutes écoulées", () => {
    expect(formatRelativeInstant("2026-11-07T13:59:30.000Z", now)).toBe("à l'instant");
    expect(formatRelativeInstant("2026-11-07T13:48:00.000Z", now)).toBe("il y a 12 min");
  });

  it("donne l'heure locale le jour même, la date sinon", () => {
    expect(formatRelativeInstant("2026-11-07T08:05:00.000Z", now)).toBe("aujourd'hui à 10:05");
    expect(formatRelativeInstant("2026-11-06T16:30:00.000Z", now)).toBe("le 06/11/2026 à 18:30");
  });
});

describe("zonedDayStart", () => {
  it("donne minuit local en UTC", () => {
    expect(zonedDayStart("2026-11-07", "Africa/Lubumbashi")).toBe("2026-11-06T22:00:00.000Z");
    expect(zonedDayStart("2026-11-07", "Africa/Kinshasa")).toBe("2026-11-06T23:00:00.000Z");
    expect(zonedDayStart("2026-03-29", "Europe/Paris")).toBe("2026-03-28T23:00:00.000Z");
  });

  it("refuse une date invalide", () => {
    expect(zonedDayStart("2026-02-30")).toBeNull();
    expect(zonedDayStart("07/11/2026")).toBeNull();
  });
});
