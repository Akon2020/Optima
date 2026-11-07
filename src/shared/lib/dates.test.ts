import { describe, expect, it } from "vitest";

import { formatRelativeInstant } from "./dates";

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
