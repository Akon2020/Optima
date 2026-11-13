import "server-only";

import ExcelJS from "exceljs";

import { PRINT_TOKENS } from "@/styles/tokens/print";

import type { TableExport } from "./table-document";

/**
 * Classeur Excel (EF-AUD-04, EF-RAP) avec ExcelJS (pile D-014). Les valeurs
 * sont écrites comme du texte ou des nombres, jamais comme des formules :
 * une cellule « =… » reste un texte (pas d'injection de formules).
 */
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

export async function buildWorkbook(table: TableExport & { sheetName: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPTIMA";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(table.sheetName.slice(0, 31), {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.addRow([table.title]).font = {
    bold: true,
    size: 14,
    color: { argb: argb(PRINT_TOKENS.brand) },
  };
  for (const line of table.details) {
    sheet.addRow([line]).font = { color: { argb: argb(PRINT_TOKENS.muted) } };
  }
  sheet.addRow([`Généré le ${table.generatedAt}`]).font = {
    italic: true,
    color: { argb: argb(PRINT_TOKENS.muted) },
  };
  sheet.addRow([]);

  const headerRow = sheet.addRow([...table.header]);
  headerRow.font = { bold: true, color: { argb: argb(PRINT_TOKENS.onBrand) } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PRINT_TOKENS.brand) } };
    cell.alignment = { vertical: "middle" };
  });
  for (const row of table.rows) {
    const added = sheet.addRow(
      row.map((cell) => (cell === null || cell === undefined ? "" : cell)),
    );
    added.alignment = { vertical: "top", wrapText: true };
  }

  const headerIndex = headerRow.number;
  sheet.views = [{ state: "frozen", ySplit: headerIndex }];
  sheet.autoFilter = {
    from: { row: headerIndex, column: 1 },
    to: { row: headerIndex, column: table.header.length },
  };
  const weights = table.columnWeights ?? table.header.map(() => 1);
  weights.forEach((weight, index) => {
    sheet.getColumn(index + 1).width = Math.min(60, Math.max(10, Math.round(weight * 9)));
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
