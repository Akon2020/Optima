import { formatDate, formatTime } from "@/shared/lib/dates";
import { formatMoney, moneyFromMinor } from "@/shared/lib/money";

import { remainingDue, type InvoiceBalance } from "../../domain/payment";
import { buildTableBill, type TableSession } from "../../domain/tables";

/**
 * Addition récapitulative d'une table (EF-CMD-05) : toutes les factures
 * d'avance de l'occupation, regroupées, avec le déjà-payé et le reste dû
 * (EF-ENC-02). Toujours rendue en clair (§ 9).
 */
export function TableBillTicket({
  session,
  tableLabel,
  establishmentName,
  printedAt,
  balances,
}: {
  session: TableSession;
  tableLabel: string;
  establishmentName: string;
  printedAt: string;
  balances?: ReadonlyMap<string, InvoiceBalance>;
}) {
  const bill = buildTableBill(session);
  const remaining = balances
    ? remainingDue(
        session.invoices.map((invoice) => invoice.id),
        balances,
        bill.total.currency,
      )
    : bill.total;
  const discount = moneyFromMinor(
    session.invoices.reduce((sum, invoice) => sum + (invoice.discount?.amountMinor ?? 0), 0),
    bill.total.currency,
  );
  const paid = moneyFromMinor(
    bill.total.amountMinor - discount.amountMinor - remaining.amountMinor,
    bill.total.currency,
  );
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
      {discount.amountMinor > 0 ? (
        <p className="flex justify-between">
          <span>Remise</span>
          <span className="tabular">−{formatMoney(discount)}</span>
        </p>
      ) : null}
      {paid.amountMinor > 0 || discount.amountMinor > 0 ? (
        <>
          <p className="flex justify-between">
            <span>Déjà payé</span>
            <span className="tabular">{formatMoney(paid)}</span>
          </p>
          <p className="flex justify-between font-bold">
            <span>RESTE À PAYER</span>
            <span className="tabular">{formatMoney(remaining)}</span>
          </p>
        </>
      ) : null}
      <p className="mt-2 text-[11px] opacity-80">
        Factures : {session.invoices.map((invoice) => invoice.number).join(", ")}
      </p>
    </article>
  );
}
