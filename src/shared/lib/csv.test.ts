import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("CSV pour Excel", () => {
  it("échappe les séparateurs, guillemets et retours à la ligne", () => {
    expect(csvCell("Gérant")).toBe("Gérant");
    expect(csvCell('Dit "non"; puis parti')).toBe('"Dit ""non""; puis parti"');
    expect(csvCell("ligne\nsuivante")).toBe('"ligne\nsuivante"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("neutralise les formules (injection CSV)", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+243990000000")).toBe("'+243990000000");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("produit un fichier avec BOM et lignes CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "2"]])).toBe("﻿A;B\r\n1;2\r\n");
  });
});
