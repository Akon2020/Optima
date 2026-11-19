import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  CHARS_PER_LINE,
  advanceInvoiceReceipt,
  encodeEscPos,
  encodeText,
  layoutReceipt,
  printableText,
  testReceipt,
  wrapText,
} from "./receipt";
import type { AdvanceInvoice } from "./types";

const fc = (major: number) => moneyFromMajor(major, "CDF");

const invoice: AdvanceInvoice = {
  id: "inv-1",
  establishmentId: "e",
  orderId: "o",
  servicePointId: "sp-kitchen",
  number: "FAC-2026-D01-000052",
  mode: "dine-in",
  tableLabel: "Table 4",
  waiterId: "w",
  waiterName: "Amani K.",
  deviceCode: "D01",
  createdAt: "2026-11-19T10:30:00.000Z",
  lines: [
    {
      menuItemId: "tilapia",
      name: "Tilapia",
      servicePointId: "sp-kitchen",
      unit: "dish",
      unitPrice: fc(15000),
      quantity: 2,
      options: [{ groupName: "Accompagnement", name: "Frites", priceDelta: fc(0) }],
    },
  ],
  total: fc(30000),
  prepStatus: "pending",
  paymentStatus: "unpaid",
};

describe("mise en lignes d'un ticket (D-074)", () => {
  it("rend imprimables les espaces insécables et les signes typographiques", () => {
    expect(printableText("3 500 FC × 2 — « œuf »")).toBe("3 500 FC x 2 - « oeuf »");
  });

  it("coupe aux espaces, et un mot trop long à la largeur", () => {
    expect(wrapText("Viande de chèvre grillée", 10)).toEqual(["Viande de", "chèvre", "grillée"]);
    expect(wrapText("ABCDEFGHIJKL", 5)).toEqual(["ABCDE", "FGHIJ", "KL"]);
  });

  it("aligne les valeurs à droite sur toute la largeur du papier", () => {
    for (const paper of [58, 80] as const) {
      const lines = layoutReceipt([{ kind: "row", left: "TOTAL", right: "30 000 FC" }], paper);
      expect(lines[0]?.text).toHaveLength(CHARS_PER_LINE[paper]);
      expect(lines[0]?.text.endsWith("30 000 FC")).toBe(true);
    }
    // Texte de gauche trop long : il passe à la ligne, la valeur reste sur la dernière.
    const long = layoutReceipt(
      [{ kind: "row", left: "2 x Brochettes de chèvre bien grillées", right: "10 000 FC" }],
      58,
    );
    expect(long.length).toBeGreaterThan(1);
    expect(long.at(-1)?.text.endsWith("10 000 FC")).toBe(true);
    expect(long.every((line) => line.text.length <= 32)).toBe(true);
  });

  it("la facture d'avance reprend le numéro, la table, le serveur, les lignes et le total", () => {
    const text = layoutReceipt(
      advanceInvoiceReceipt({
        invoice,
        establishmentName: "Best Food I",
        servicePointName: "Cuisine",
        timeZone: "Africa/Lubumbashi",
      }),
      58,
    )
      .map((line) => line.text)
      .join("\n");
    expect(text).toContain("BEST FOOD I");
    expect(text).toContain("Facture d'avance · Cuisine");
    expect(text).toContain("FAC-2026-D01-000052");
    expect(text).toContain("19/11/2026 12:30");
    expect(text).toContain("Table 4");
    expect(text).toContain("Amani K.");
    expect(text).toMatch(/2 x Tilapia +30 000 FC/);
    expect(text).toContain("Frites");
    expect(text).toMatch(/TOTAL +30 000 FC/);
  });
});

describe("encodage ESC/POS (D-074)", () => {
  it("encode les accents en page 850, et retombe sur la lettre sans accent", () => {
    expect(encodeText("é è à ç É")).toEqual([0x82, 0x20, 0x8a, 0x20, 0x85, 0x20, 0x87, 0x20, 0x90]);
    expect(encodeText("ñ")).toEqual([0x6e]);
    expect(encodeText("€")).toEqual([0x3f]);
  });

  it("initialise, choisit la page 850, met en gras puis coupe", () => {
    const bytes = [
      ...encodeEscPos(
        [
          { kind: "text", text: "OPTIMA", align: "center", bold: true },
          { kind: "text", text: "ok" },
        ],
        58,
      ),
    ];
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
    const center = bytes.indexOf(0x61);
    expect(bytes.slice(center - 1, center + 2)).toEqual([0x1b, 0x61, 1]);
    expect(bytes.slice(-7)).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
    // Aucun octet hors de la plage d'un ticket : tout est encodé.
    expect(bytes.every((byte) => byte >= 0 && byte <= 0xff)).toBe(true);
  });

  it("le ticket d'essai remplit exactement une ligne de chiffres", () => {
    const lines = layoutReceipt(
      testReceipt({ establishmentName: "Best Food I", at: "2026-11-19T10:30:00Z", paper: 80 }),
      80,
    );
    expect(lines.some((line) => line.text === "1".repeat(48))).toBe(true);
  });
});
