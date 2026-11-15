import { PRINT_TOKENS } from "@/styles/tokens/print";

/**
 * Document tabulaire imprimable (A4), commun aux exports PDF : journal
 * d'audit aujourd'hui, rapports demain. Fonctions pures. Toutes les valeurs
 * sont échappées : le document est rendu par un navigateur sans JavaScript et
 * sans réseau (voir `pdf.ts`), mais l'échappement reste la première barrière.
 */

export type TableCell = string | number | null | undefined;

export type TableExport = {
  /** Titre du document, par exemple « Journal d'audit ». */
  title: string;
  /** Lignes d'information sous le titre : établissement, période, filtres. */
  details: readonly string[];
  header: readonly string[];
  rows: readonly (readonly TableCell[])[];
  /** Horodatage de génération, déjà formaté dans le fuseau de l'établissement. */
  generatedAt: string;
  /** Largeurs relatives des colonnes (même nombre que `header`). */
  columnWeights?: readonly number[];
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: TableCell): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Une section d'un rapport : un titre et un tableau. */
export type ReportSection = {
  title: string;
  header: readonly string[];
  rows: readonly (readonly TableCell[])[];
  columnWeights?: readonly number[];
  /** Texte affiché quand la section est vide. */
  emptyLabel?: string;
};

/** Rapport en plusieurs sections (EF-RAP-04), avec l'en-tête de l'établissement. */
export type ReportExport = {
  title: string;
  /** En-tête de l'établissement : nom, adresse, téléphone (EF-ETB-02). */
  establishment: readonly string[];
  details: readonly string[];
  sections: readonly ReportSection[];
  generatedAt: string;
};

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Dans un PDF, un nombre se lit avec ses séparateurs de milliers (« 7 000 ») ; Excel garde le nombre brut. */
function printable(cell: TableCell): TableCell {
  return typeof cell === "number" ? NUMBER_FORMAT.format(cell) : cell;
}

function tableHtml(section: Omit<ReportSection, "title">): string {
  const weights = section.columnWeights ?? section.header.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const columns = weights
    .map((weight) => `<col style="width:${((weight / total) * 100).toFixed(2)}%">`)
    .join("");
  const head = section.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body =
    section.rows.length === 0
      ? `<tr><td colspan="${section.header.length}" class="empty">${escapeHtml(section.emptyLabel ?? "Aucune entrée.")}</td></tr>`
      : section.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${escapeHtml(printable(cell))}</td>`).join("")}</tr>`,
          )
          .join("");
  return `<table>
  <colgroup>${columns}</colgroup>
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>`;
}

export function buildReportDocument(report: ReportExport): string {
  const t = PRINT_TOKENS;
  const lines = (values: readonly string[]) =>
    values.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const sections = report.sections
    .map(
      (section) => `<section><h2>${escapeHtml(section.title)}</h2>${tableHtml(section)}</section>`,
    )
    .join("");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: ${t.ink}; background: ${t.paper}; font: 9pt/1.35 "Segoe UI", Arial, sans-serif; }
  header { border-bottom: 2px solid ${t.brand}; padding-bottom: 6pt; margin-bottom: 8pt; display: flex; justify-content: space-between; gap: 12pt; }
  .brand { color: ${t.brand}; font-weight: 700; letter-spacing: 0.2em; font-size: 9pt; margin: 0; }
  h1 { font-size: 15pt; margin: 2pt 0 4pt; }
  h2 { font-size: 11pt; margin: 12pt 0 4pt; color: ${t.brand}; }
  header p { margin: 0; color: ${t.muted}; }
  .establishment { text-align: right; }
  .establishment p:first-child { color: ${t.ink}; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: ${t.brand}; color: ${t.onBrand}; text-align: left; font-weight: 600; padding: 4pt; }
  td { padding: 3pt 4pt; border-bottom: 1px solid ${t.border}; vertical-align: top; overflow-wrap: break-word; }
  tbody tr:nth-child(even) td { background: ${t.rowAlt}; }
  tr { page-break-inside: avoid; }
  section { page-break-inside: auto; }
  h2 { page-break-after: avoid; }
  .empty { text-align: center; color: ${t.muted}; padding: 8pt; }
  footer { margin-top: 10pt; color: ${t.muted}; }
</style>
</head>
<body>
<header>
  <div>
    <p class="brand">OPTIMA</p>
    <h1>${escapeHtml(report.title)}</h1>
    ${lines(report.details)}
  </div>
  <div class="establishment">${lines(report.establishment)}</div>
</header>
${sections}
<footer>Généré le ${escapeHtml(report.generatedAt)}.</footer>
</body>
</html>`;
}

export function buildTableDocument(table: TableExport): string {
  const weights = table.columnWeights ?? table.header.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const t = PRINT_TOKENS;
  const columns = weights
    .map((weight) => `<col style="width:${((weight / total) * 100).toFixed(2)}%">`)
    .join("");
  const head = table.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body =
    table.rows.length === 0
      ? `<tr><td colspan="${table.header.length}" class="empty">Aucune entrée.</td></tr>`
      : table.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("");
  const details = table.details.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(table.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: ${t.ink}; background: ${t.paper}; font: 9pt/1.35 "Segoe UI", Arial, sans-serif; }
  header { border-bottom: 2px solid ${t.brand}; padding-bottom: 6pt; margin-bottom: 8pt; }
  .brand { color: ${t.brand}; font-weight: 700; letter-spacing: 0.2em; font-size: 9pt; margin: 0; }
  h1 { font-size: 15pt; margin: 2pt 0 4pt; }
  header p { margin: 0; color: ${t.muted}; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: ${t.brand}; color: ${t.onBrand}; text-align: left; font-weight: 600; padding: 4pt; }
  td { padding: 3pt 4pt; border-bottom: 1px solid ${t.border}; vertical-align: top; overflow-wrap: break-word; }
  tbody tr:nth-child(even) td { background: ${t.rowAlt}; }
  tr { page-break-inside: avoid; }
  .empty { text-align: center; color: ${t.muted}; padding: 12pt; }
  footer { margin-top: 8pt; color: ${t.muted}; }
</style>
</head>
<body>
<header>
  <p class="brand">OPTIMA</p>
  <h1>${escapeHtml(table.title)}</h1>
  ${details}
</header>
<table>
  <colgroup>${columns}</colgroup>
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>
<footer>Généré le ${escapeHtml(table.generatedAt)} · ${table.rows.length} ligne${table.rows.length > 1 ? "s" : ""}.</footer>
</body>
</html>`;
}
