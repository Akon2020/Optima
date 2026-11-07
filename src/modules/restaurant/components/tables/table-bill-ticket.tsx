import { formatDate, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";

import { buildTableBill, type TableSession } from "../../domain/tables";

/**
 * Addition récapitulative d'une table (EF-CMD-05) : toutes les factures
 * d'avance de l'occupation, regroupées. Toujours rendue en clair (§ 9).
 */
export function TableBillTicket({
  session,
  tableLabel,
  establishmentName,
  printedAt,
}: {
  session: TableSession;
  tableLabel: string;
  establishmentName: string;
  printedAt: string;
}) {
  const bill = buildTableBill(session);
  return (
    <article
      aria-label={`Addition ${tableLabel}`}
      className="ticket mx-auto w-full max-w-[320px] rounded-sm border border-dashed border-ticket-border bg-ticket-bg p-4 font-mono text-[12px] leading-relaxed text-ticket-ink"
    >
      <header className="text-center">
        <p className="text-[13px] font-bold uppercase">{establishmentName}</p>
        <p>Addition récapitulative</p>
      </header>
      <hr className="my-2 border-dashed border-ticket-border" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt>Table</dt>
        <dd className="text-right font-bold">{tableLabel}</dd>
        <dt>Date</dt>
        <dd className="text-right">
          {formatDate(printedAt)} {formatTime(printedAt)}
        </dd>
        <dt>Serveur</dt>
        <dd className="text-right">{session.waiterNames.join(", ")}</dd>
      </dl>
      <hr className="my-2 border-dashed border-ticket-border" />
      <ul>
        {bill.lines.map((line) => (
          <li
            key={`${line.menuItemId}-${line.unitPrice.amountMinor}`}
            className="flex justify-between gap-3"
          >
            <span className="min-w-0">
              {line.quantity} × {line.name}
              <span className="block opacity-70">à {formatMoney(line.unitPrice)}</span>
            </span>
            <span className="shrink-0 tabular">{formatMoney(line.total)}</span>
          </li>
        ))}
      </ul>
      <hr className="my-2 border-dashed border-ticket-border" />
      <p className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span className="tabular">{formatMoney(bill.total)}</span>
      </p>
      <p className="mt-2 text-[11px] opacity-80">
        Factures : {session.invoices.map((invoice) => invoice.number).join(", ")}
      </p>
    </article>
  );
}
