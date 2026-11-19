import { formatDate, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";

import { formatQuantity } from "./menu";
import { lineTotal } from "./order";
import type { AdvanceInvoice, OrderMode } from "./types";

/**
 * Tickets pour imprimante thermique (EF-DOC-02, D-074) : un petit modèle de
 * document, sa mise en lignes à la largeur du papier, puis son encodage en
 * ESC/POS. Le transport (Bluetooth par Web Serial, USB, navigateur) est
 * ailleurs : ce fichier ne fait que des calculs, testables sans imprimante.
 */

export type PaperWidth = 58 | 80;

/** Caractères par ligne en police A : 32 sur 58 mm, 48 sur 80 mm. */
export const CHARS_PER_LINE: Record<PaperWidth, number> = { 58: 32, 80: 48 };

export type ReceiptBlock =
  | { kind: "text"; text: string; align?: "left" | "center"; bold?: boolean; large?: boolean }
  /** Texte à gauche, valeur alignée à droite (montant, numéro). */
  | { kind: "row"; left: string; right: string; bold?: boolean }
  | { kind: "rule" }
  | { kind: "blank" };

export type Receipt = ReceiptBlock[];

/** Ligne prête à imprimer, déjà coupée à la largeur du papier. */
export type LaidOutLine = { text: string; align: "left" | "center"; bold: boolean; large: boolean };

// ─── Textes ──────────────────────────────────────────────────────────────────

/** Espaces insécables (montants en fr-CD) et signes typographiques rendus imprimables. */
export function printableText(input: string): string {
  return input
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/×/g, "x")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE");
}

/** Coupe un texte en lignes de `width` caractères au plus, aux espaces si possible. */
export function wrapText(input: string, width: number): string[] {
  const text = printableText(input).trim();
  if (text === "") return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    let rest = word;
    while (rest.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    if (current === "") current = rest;
    else if (current.length + 1 + rest.length <= width) current = `${current} ${rest}`;
    else {
      lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Mise en lignes d'un ticket. Une ligne « gauche / droite » trop longue
 * renvoie le texte de gauche à la ligne et garde la valeur à droite.
 */
export function layoutReceipt(receipt: Receipt, paper: PaperWidth): LaidOutLine[] {
  const width = CHARS_PER_LINE[paper];
  const out: LaidOutLine[] = [];
  for (const block of receipt) {
    if (block.kind === "rule") {
      out.push({ text: "-".repeat(width), align: "left", bold: false, large: false });
    } else if (block.kind === "blank") {
      out.push({ text: "", align: "left", bold: false, large: false });
    } else if (block.kind === "text") {
      // Le double format occupe deux colonnes par caractère.
      const columns = block.large ? Math.floor(width / 2) : width;
      for (const text of wrapText(block.text, columns)) {
        out.push({
          text,
          align: block.align ?? "left",
          bold: block.bold ?? false,
          large: block.large ?? false,
        });
      }
    } else {
      const right = printableText(block.right).trim();
      const leftWidth = Math.max(1, width - right.length - 1);
      const left = wrapText(block.left, leftWidth);
      left.forEach((text, index) => {
        const isLast = index === left.length - 1;
        out.push({
          text: isLast ? `${text}${" ".repeat(width - text.length - right.length)}${right}` : text,
          align: "left",
          bold: block.bold ?? false,
          large: false,
        });
      });
    }
  }
  return out;
}

// ─── Encodage ESC/POS ────────────────────────────────────────────────────────

/** Page de code 850 (Europe de l'Ouest) : lettres accentuées du français. */
const CP850: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  Ä: 0x8e,
  É: 0x90,
  ô: 0x93,
  ö: 0x94,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  "°": 0xf8,
  "«": 0xae,
  "»": 0xaf,
  À: 0xb7,
  Â: 0xb6,
  Ê: 0xd2,
  Ë: 0xd3,
  È: 0xd4,
  Î: 0xd7,
  Ï: 0xd8,
  Ô: 0xe2,
  Û: 0xea,
  Ù: 0xeb,
  "·": 0xfa,
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Un caractère vers la page 850 ; sinon sa lettre sans accent, sinon « ? ». */
function encodeChar(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x20 && code < 0x7f) return code;
  const mapped = CP850[char];
  if (mapped !== undefined) return mapped;
  const bare = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const bareCode = bare.charCodeAt(0);
  return bare.length > 0 && bareCode >= 0x20 && bareCode < 0x7f ? bareCode : 0x3f;
}

export function encodeText(text: string): number[] {
  return [...printableText(text)].map(encodeChar);
}

/**
 * Encode un ticket en ESC/POS : initialisation, page de code 850, lignes
 * (alignement, gras, double format), avance du papier et coupe. Les
 * imprimantes sans massicot ignorent la coupe.
 */
export function encodeEscPos(receipt: Receipt, paper: PaperWidth): Uint8Array {
  const bytes: number[] = [ESC, 0x40, ESC, 0x74, 0x02];
  let bold = false;
  let large = false;
  let align: "left" | "center" = "left";
  for (const line of layoutReceipt(receipt, paper)) {
    if (line.align !== align) {
      bytes.push(ESC, 0x61, line.align === "center" ? 1 : 0);
      align = line.align;
    }
    if (line.bold !== bold) {
      bytes.push(ESC, 0x45, line.bold ? 1 : 0);
      bold = line.bold;
    }
    if (line.large !== large) {
      bytes.push(GS, 0x21, line.large ? 0x11 : 0x00);
      large = line.large;
    }
    bytes.push(...encodeText(line.text), LF);
  }
  bytes.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0x00);
  // Avance de 4 lignes, puis coupe partielle.
  bytes.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(bytes);
}

// ─── Tickets du restaurant ──────────────────────────────────────────────────

const PLACE_LABELS: Record<OrderMode, string> = {
  "dine-in": "Sur place",
  takeaway: "À emporter",
  delivery: "Livraison",
};

/**
 * Facture d'avance (EF-CMD-03, EF-DOC-03) : même contenu que le ticket à
 * l'écran, une facture par point de service.
 */
export function advanceInvoiceReceipt(input: {
  invoice: AdvanceInvoice;
  establishmentName: string;
  servicePointName: string;
  timeZone?: string;
}): Receipt {
  const { invoice } = input;
  const place =
    invoice.mode === "dine-in" && invoice.tableLabel
      ? invoice.tableLabel
      : PLACE_LABELS[invoice.mode];
  const lines: Receipt = invoice.lines.flatMap((line) => {
    const detail = [...(line.options ?? []).map((option) => option.name), line.formula?.name]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    return [
      { kind: "row", left: `${line.quantity} x ${line.name}`, right: formatMoney(lineTotal(line)) },
      ...(detail ? [{ kind: "text" as const, text: `  ${detail}` }] : []),
      {
        kind: "text",
        text: `  ${formatQuantity(line.quantity, line.unit)} à ${formatMoney(line.unitPrice)}`,
      },
    ] satisfies Receipt;
  });
  return [
    { kind: "text", text: input.establishmentName.toUpperCase(), align: "center", bold: true },
    { kind: "text", text: `Facture d'avance · ${input.servicePointName}`, align: "center" },
    { kind: "rule" },
    { kind: "row", left: "N°", right: invoice.number, bold: true },
    {
      kind: "row",
      left: "Date",
      right: `${formatDate(invoice.createdAt, input.timeZone)} ${formatTime(invoice.createdAt, input.timeZone)}`,
    },
    { kind: "row", left: "Table", right: place },
    { kind: "row", left: "Serveur", right: invoice.waiterName },
    { kind: "rule" },
    ...lines,
    { kind: "rule" },
    { kind: "row", left: "TOTAL", right: formatMoney(invoice.total), bold: true },
    ...(invoice.paymentStatus === "cancelled"
      ? ([{ kind: "text", text: "ANNULÉE", align: "center", bold: true }] satisfies Receipt)
      : []),
  ];
}

/** Ticket d'essai : largeur, accents, gras et grand format. */
export function testReceipt(input: {
  establishmentName: string;
  at: string;
  paper: PaperWidth;
}): Receipt {
  const width = CHARS_PER_LINE[input.paper];
  return [
    { kind: "text", text: "OPTIMA", align: "center", bold: true, large: true },
    { kind: "text", text: input.establishmentName, align: "center" },
    { kind: "text", text: "Ticket d'essai de l'imprimante", align: "center" },
    { kind: "rule" },
    { kind: "row", left: "Papier", right: `${input.paper} mm (${width} caractères)` },
    { kind: "row", left: "Date", right: `${formatDate(input.at)} ${formatTime(input.at)}` },
    { kind: "rule" },
    { kind: "text", text: "Accents : é è ê à ç ù ô î É À Ç « »" },
    { kind: "text", text: "Gras", bold: true },
    { kind: "row", left: "1 x Primus 72 cl", right: "3 500 FC" },
    { kind: "text", text: "1".repeat(width) },
    {
      kind: "text",
      text: "Si cette ligne de chiffres tient sur une seule ligne, la largeur est juste.",
    },
  ];
}
