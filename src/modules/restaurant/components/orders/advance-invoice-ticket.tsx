import { formatDate, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";

import { formatQuantity } from "../../domain/menu";
import { lineTotal } from "../../domain/order";
import type { AdvanceInvoice } from "../../domain/types";
import { orderPlaceLabel } from "../labels";

/**
 * Facture d'avance au format ticket (EF-CMD-03, EF-DOC-03) : numéro, table,
 * serveur, heure, détail et montant. Toujours rendue en clair, y compris à
 * l'écran en thème sombre (§ 9). L'en-tête définitif de l'établissement et le
 * QR de vérification viendront avec le module Documents (D-Q13).
 */
export function AdvanceInvoiceTicket({
  invoice,
  establishmentName,
  servicePointName,
}: {
  invoice: AdvanceInvoice;
  establishmentName: string;
  servicePointName: string;
}) {
  return (
    <article
      aria-label={`Facture d'avance ${invoice.number}`}
      className="ticket mx-auto w-full max-w-[320px] rounded-sm border border-dashed border-ticket-border bg-ticket-bg p-4 font-mono text-[12px] leading-relaxed text-ticket-ink"
    >
      <header className="text-center">
        <p className="text-[13px] font-bold uppercase">{establishmentName}</p>
        <p>Facture d&apos;avance · {servicePointName}</p>
      </header>
      <hr className="my-2 border-dashed border-ticket-border" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3">
        <dt>N°</dt>
        <dd className="text-right font-bold">{invoice.number}</dd>
        <dt>Date</dt>
        <dd className="text-right">
          {formatDate(invoice.createdAt)} {formatTime(invoice.createdAt)}
        </dd>
        <dt>Table</dt>
        <dd className="text-right">{orderPlaceLabel(invoice.mode, invoice.tableLabel)}</dd>
        <dt>Serveur</dt>
        <dd className="text-right">{invoice.waiterName}</dd>
      </dl>
      <hr className="my-2 border-dashed border-ticket-border" />
      <ul>
        {invoice.lines.map((line) => (
          <li key={line.menuItemId} className="flex justify-between gap-3">
            <span className="min-w-0">
              {line.quantity} × {line.name}
              <span className="block opacity-70">
                {formatQuantity(line.quantity, line.unit)} à {formatMoney(line.unitPrice)}
              </span>
            </span>
            <span className="shrink-0 tabular">{formatMoney(lineTotal(line))}</span>
          </li>
        ))}
      </ul>
      <hr className="my-2 border-dashed border-ticket-border" />
      <p className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span className="tabular">{formatMoney(invoice.total)}</span>
      </p>
      {invoice.paymentStatus === "cancelled" ? (
        <p className="mt-2 text-center font-bold uppercase">Annulée</p>
      ) : null}
    </article>
  );
}
