import { describe, expect, it } from "vitest";

import { counterKey, formatDocumentNumber } from "./numbering";

describe("numérotation des documents", () => {
  it("EF-DOC-01 : produit TYPE-ANNÉE-CODEAPPAREIL-SÉQUENCE", () => {
    expect(
      formatDocumentNumber({ prefix: "FAC", year: 2026, deviceCode: "D01", sequence: 52 }),
    ).toBe("FAC-2026-D01-000052");
  });

  it("EF-DOC-01 : deux appareils ne produisent jamais le même numéro", () => {
    const a = formatDocumentNumber({ prefix: "FAC", year: 2026, deviceCode: "D01", sequence: 1 });
    const b = formatDocumentNumber({ prefix: "FAC", year: 2026, deviceCode: "D02", sequence: 1 });
    expect(a).not.toBe(b);
  });

  it("refuse un code appareil, une année ou une séquence invalides", () => {
    expect(() =>
      formatDocumentNumber({ prefix: "FAC", year: 2026, deviceCode: "X1", sequence: 1 }),
    ).toThrow(/Code appareil/);
    expect(() =>
      formatDocumentNumber({ prefix: "FAC", year: 2026, deviceCode: "D01", sequence: 0 }),
    ).toThrow(/Séquence/);
    expect(() =>
      formatDocumentNumber({ prefix: "FAC", year: 26, deviceCode: "D01", sequence: 1 }),
    ).toThrow(/Année/);
  });

  it("tient un compteur par type, année et appareil", () => {
    expect(counterKey("FAC", 2026, "D01")).not.toBe(counterKey("CMD", 2026, "D01"));
    expect(counterKey("FAC", 2026, "D01")).not.toBe(counterKey("FAC", 2027, "D01"));
  });
});
