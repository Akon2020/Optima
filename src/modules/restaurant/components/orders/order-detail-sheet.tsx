"use client";

import { Ban, Banknote, Check, HandCoins, Percent, Printer, Utensils } from "lucide-react";
import { useState } from "react";

import { formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney } from "@/shared/lib/money";
import { StatusLabel } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Sheet } from "@/shared/ui/sheet";

import type { AdjustmentKind, AdvanceInvoice, PrepStatus } from "../../domain/types";
import { pendingRequests } from "../../domain/adjustment";
import { remainingDue } from "../../domain/payment";
import { useDayData } from "../../offline/hooks";
import { setInvoicePrepStatus } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import {
  PAYMENT_STATUS,
  PREP_STATUS,
  SERVICE_POINT_ICONS,
  orderLineDetail,
  orderPlaceLabel,
} from "../labels";
import { AdjustmentSheet } from "../adjustments/adjustment-sheet";
import { OrderAdjustments } from "../adjustments/order-adjustments";
import { PaymentSheet } from "../payments/payment-sheet";
import { useRestaurant } from "../restaurant-provider";
import { AdvanceInvoiceTicket } from "./advance-invoice-ticket";
import type { OrderRow } from "./order-rows";

const NEXT_STATUS: Partial<Record<PrepStatus, { status: PrepStatus; label: string }>> = {
  pending: { status: "ready", label: "Marquer prête" },
  ready: { status: "served", label: "Marquer servie" },
};

/**
 * Détail d'une commande : ses factures d'avance par point de service, leur
 * suivi de préparation, leur réimpression et leur encaissement (EF-ENC-02).
 */
export function OrderDetailSheet({
  row,
  onOpenChange,
}: {
  row: OrderRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { db, ctx, establishmentName } = useRestaurant();
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<AdvanceInvoice[] | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [adjusting, setAdjusting] = useState<AdjustmentKind | null>(null);
  const data = useDayData();
  const balances = data?.balances;
  const remaining =
    row && balances
      ? remainingDue(
          row.invoices.map((invoice) => invoice.id),
          balances,
          ctx.settings.currency,
        )
      : null;
  // Matrice des droits : un serveur n'encaisse que ses ventes ; un gérant encaisse à sa place.
  const canCollect =
    row !== null &&
    hasPermission(ctx.role, "restaurant.payment.collect") &&
    (ctx.role !== "waiter" || row.order.waiterId === ctx.userId);
  // D-058 : annulation et remise, demandées par le serveur sur ses commandes, validées par le gérant.
  const hasPending =
    row !== null &&
    data !== undefined &&
    pendingRequests(data.adjustmentRequests, data.adjustmentDecisions).some(
      (request) => request.orderId === row.order.id,
    );
  const canAdjust =
    row !== null &&
    !row.isCancelled &&
    !hasPending &&
    hasPermission(ctx.role, "restaurant.adjustment.request") &&
    (ctx.role !== "waiter" || row.order.waiterId === ctx.userId);
  const isManager = hasPermission(ctx.role, "restaurant.adjustment.approve");

  async function advance(invoice: AdvanceInvoice, status: PrepStatus) {
    setError(null);
    try {
      await setInvoicePrepStatus(db, ctx, invoice.id, status);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function print(invoices: AdvanceInvoice[]) {
    setPrinting(invoices);
    requestAnimationFrame(() => {
      window.print();
      setPrinting(null);
    });
  }

  const pointName = (id: string) =>
    row?.servicePoints.find((point) => point.id === id)?.name ?? "Point de service";

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) setError(null);
        onOpenChange(open);
      }}
      title={
        row
          ? `${orderPlaceLabel(row.order.mode, row.order.tableLabel)} · ${formatMoney(row.order.total)}`
          : ""
      }
      description={
        row
          ? `${row.order.number} · ${row.order.waiterName} · ${formatTime(row.order.createdAt)}`
          : undefined
      }
      footer={
        row ? (
          <div className="flex flex-col gap-2">
            {canCollect && remaining && remaining.amountMinor > 0 ? (
              <Button variant="action" className="w-full" onClick={() => setIsPaying(true)}>
                <Banknote aria-hidden />
                Encaisser {formatMoney(remaining)}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => print(row.invoices.filter((i) => i.paymentStatus !== "cancelled"))}
            >
              <Printer aria-hidden />
              Réimprimer les factures d&apos;avance
            </Button>
            {canAdjust ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setAdjusting("cancel")}>
                  <Ban aria-hidden />
                  {isManager ? "Annuler" : "Demander l'annulation"}
                </Button>
                {remaining && remaining.amountMinor > 0 ? (
                  <Button variant="ghost" onClick={() => setAdjusting("discount")}>
                    <Percent aria-hidden />
                    {isManager ? "Remise" : "Demander une remise"}
                  </Button>
                ) : null}
                {remaining &&
                remaining.amountMinor > 0 &&
                !row.invoices.some((invoice) => invoice.creditRequestId) ? (
                  <Button
                    variant="ghost"
                    className="col-span-2"
                    onClick={() => setAdjusting("credit")}
                  >
                    <HandCoins aria-hidden />
                    {isManager ? "Vendre à crédit" : "Demander un crédit"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      {row ? (
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          {row.invoices.map((invoice) => {
            const point = row.servicePoints.find((p) => p.id === invoice.servicePointId);
            const Icon = point ? SERVICE_POINT_ICONS[point.kind] : Utensils;
            const status = PREP_STATUS[invoice.prepStatus];
            const paymentStatus = balances?.get(invoice.id)?.status ?? "unpaid";
            // D-059 : un reste converti en dette client s'affiche « À crédit ».
            const payment =
              invoice.creditRequestId && paymentStatus !== "paid"
                ? { label: "À crédit", tone: "accent" as const }
                : PAYMENT_STATUS[paymentStatus];
            const next = NEXT_STATUS[invoice.prepStatus];
            return (
              <section
                key={invoice.id}
                aria-label={`Facture ${invoice.number}`}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="grid size-9 place-items-center rounded-md bg-bg-subtle text-text-muted"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{pointName(invoice.servicePointId)}</p>
                      <p className="text-xs text-text-muted tabular">{invoice.number}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusLabel tone={status.tone} className="text-xs">
                      {status.label}
                    </StatusLabel>
                    <StatusLabel tone={payment.tone} className="text-xs">
                      {payment.label}
                    </StatusLabel>
                  </div>
                </div>
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {invoice.lines.map((line, index) => (
                    <li key={`${line.menuItemId}-${index}`} className="flex justify-between gap-3">
                      <span>
                        <span className="text-text-muted tabular">{line.quantity}×</span>{" "}
                        {line.name}
                        {orderLineDetail(line) ? (
                          <span className="block text-xs text-text-muted">
                            {orderLineDetail(line)}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <p className="text-sm font-semibold tabular">{formatMoney(invoice.total)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => print([invoice])}>
                      <Printer aria-hidden />
                      <span className="sr-only sm:not-sr-only">Imprimer</span>
                    </Button>
                    {next ? (
                      <Button
                        size="sm"
                        variant="action"
                        onClick={() => void advance(invoice, next.status)}
                      >
                        <Check aria-hidden />
                        {next.label}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
          {data ? (
            <OrderAdjustments
              orderId={row.order.id}
              requests={data.adjustmentRequests}
              decisions={data.adjustmentDecisions}
            />
          ) : null}
        </div>
      ) : null}

      {row ? (
        <PaymentSheet
          open={isPaying}
          onOpenChange={setIsPaying}
          title={`${orderPlaceLabel(row.order.mode, row.order.tableLabel)} · ${row.order.number}`}
          invoices={row.invoices}
        />
      ) : null}
      {row ? (
        <AdjustmentSheet
          kind={adjusting}
          orderId={row.order.id}
          title={`${orderPlaceLabel(row.order.mode, row.order.tableLabel)} · ${row.order.number}`}
          remaining={remaining ?? row.order.total}
          onOpenChange={(open) => !open && setAdjusting(null)}
        />
      ) : null}

      {printing ? (
        <div className="print-area hidden print:block">
          {printing.map((invoice) => (
            <AdvanceInvoiceTicket
              key={invoice.id}
              invoice={invoice}
              establishmentName={establishmentName}
              servicePointName={pointName(invoice.servicePointId)}
            />
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
