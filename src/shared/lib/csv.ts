/**
 * Fichier CSV lisible par Excel en français : séparateur « ; », BOM UTF-8,
 * fins de ligne CRLF. Les cellules qui commencent par = + - @ (ou une
 * tabulation) sont préfixées d'une apostrophe : sans cela, un tableur les
 * exécuterait comme des formules (injection de formules CSV).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
