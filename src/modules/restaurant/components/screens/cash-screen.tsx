"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Banknote, CircleDollarSign, HandCoins, Receipt, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatDate, formatLongDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, moneyFromMajor, sumMoney } from "@/shared/lib/money";
import { StatusLabel } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input } from "@/shared/ui/field";
import { Kpi } from "@/shared/ui/kpi";

import { collectedAmount, combinedPaymentStatus, holdingsByMode } from "../../domain/payment";
import type { AdvanceInvoice, Order, Payment } from "../../domain/types";
import { useDayData } from "../../offline/hooks";
import { addExchangeRate } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  PROVIDER_LABELS,
  holdingLabel,
  orderPlaceLabel,
} from "../labels";
import { PaymentSheet } from "../payments/payment-sheet";
import { useRestaurant } from "../restaurant-provider";

type OpenOrder = { order: Order; invoices: AdvanceInvoice[] };

/**
 * Caisse de la journée (EF-ENC-01 à 04) : ce qui reste à encaisser, l'argent
 * détenu par mode de paiement, le taux du dollar (D-042) et les paiements
 * reçus. Un serveur ne voit que ses ventes et son argent ; le gérant voit
 * toute l'équipe et saisit le taux.
 */
export function CashScreen() {
  const { ctx } = useRestaurant();
  const data = useDayData();
  const [paying, setPaying] = useState<OpenOrder | null>(null);

  if (!data) return null;
  const base = ctx.settings.currency;
  const isTeamView = hasPermission(ctx.role, "restaurant.exchange-rate.manage");
  const invoices = data.invoices.filter(
    (invoice) =>
      invoice.paymentStatus !== "cancelled" && (isTeamView || invoice.waiterId === ctx.userId),
  );
  const payments = data.payments.filter(
    (payment) => isTeamView || payment.collectedBy === ctx.userId,
  );
  const remaining = sumMoney(
    invoices.map((invoice) => data.balances.get(invoice.id)?.remaining ?? invoice.total),
    base,
  );
  const canCollect = hasPermission(ctx.role, "restaurant.payment.collect");

  const invoicesByOrder = new Map<string, AdvanceInvoice[]>();
  for (const invoice of invoices) {
    invoicesByOrder.set(invoice.orderId, [
      ...(invoicesByOrder.get(invoice.orderId) ?? []),
      invoice,
    ]);
  }
  const open: OpenOrder[] = data.orders
    .map((order) => ({ order, invoices: invoicesByOrder.get(order.id) ?? [] }))
    .filter(({ invoices: own }) =>
      own.some((invoice) => (data.balances.get(invoice.id)?.remaining.amountMinor ?? 0) > 0),
    );

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <p className="text-sm text-text-muted first-letter:uppercase">
          Journée du {formatLongDate(data.dayStart)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Caisse</h1>
        <p className="text-sm text-text-muted">
          {isTeamView
            ? "Encaissements de toute l'équipe."
            : "Vos encaissements et l'argent que vous détenez."}
        </p>
      </div>

      {/* Une tuile par ligne sur téléphone : les montants en francs sont longs. */}
      <Card as="div" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={HandCoins}
          tone="green"
          value={formatMoney(collectedAmount(payments, base))}
          label="Encaissé aujourd'hui"
        />
        <Kpi
          icon={Receipt}
          tone="yellow"
          value={formatMoney(remaining)}
          label="Reste à encaisser"
        />
        <Kpi icon={Banknote} tone="grey" value={payments.length} label="Paiements reçus" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6">
        <Card aria-labelledby="to-collect-title">
          <CardHeader
            titleId="to-collect-title"
            title="À encaisser"
            description="Commandes de la journée qui ne sont pas encore soldées."
          />
          {open.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Rien à encaisser"
              description="Toutes les commandes de la journée sont payées."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {open.map((entry) => {
                const due = sumMoney(
                  entry.invoices.map(
                    (invoice) => data.balances.get(invoice.id)?.remaining ?? invoice.total,
                  ),
                  base,
                );
                const status =
                  PAYMENT_STATUS[
                    combinedPaymentStatus(
                      entry.invoices.map(
                        (invoice) => data.balances.get(invoice.id)?.status ?? "unpaid",
                      ),
                    )
                  ];
                const isOwn = entry.order.waiterId === ctx.userId;
                return (
                  <li
                    key={entry.order.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {orderPlaceLabel(entry.order.mode, entry.order.tableLabel)}{" "}
                        <span className="text-xs font-normal text-text-muted tabular">
                          {entry.order.number}
                        </span>
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatTime(entry.order.createdAt)} · {entry.order.waiterName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">{formatMoney(due)}</p>
                        <StatusLabel tone={status.tone} className="text-xs">
                          {status.label}
                        </StatusLabel>
                      </div>
                      {canCollect && (isTeamView || isOwn) ? (
                        <Button size="sm" variant="action" onClick={() => setPaying(entry)}>
                          Encaisser
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:gap-6">
          <HoldingsCard payments={payments} isTeamView={isTeamView} />
          <ExchangeRateCard />
        </div>
      </div>

      <PaymentsCard payments={payments} invoices={data.invoices} orders={data.orders} />

      <PaymentSheet
        open={paying !== null}
        onOpenChange={(isOpen) => !isOpen && setPaying(null)}
        title={
          paying
            ? `${orderPlaceLabel(paying.order.mode, paying.order.tableLabel)} · ${paying.order.number}`
            : ""
        }
        invoices={paying?.invoices ?? []}
      />
    </div>
  );
}

/** Argent détenu par mode de paiement (EF-ENC-04), par personne qui a encaissé (D-032). */
function HoldingsCard({ payments, isTeamView }: { payments: Payment[]; isTeamView: boolean }) {
  const { ctx } = useRestaurant();
  const base = ctx.settings.currency;
  const byPerson = new Map<string, { name: string; payments: Payment[] }>();
  for (const payment of payments) {
    const entry = byPerson.get(payment.collectedBy) ?? {
      name: payment.collectedByName || "Sans nom",
      payments: [],
    };
    entry.payments.push(payment);
    byPerson.set(payment.collectedBy, entry);
  }

  return (
    <Card aria-labelledby="holdings-title">
      <CardHeader
        titleId="holdings-title"
        title={isTeamView ? "Argent en main" : "Votre argent en main"}
        description="Par mode de paiement, monnaie rendue déduite."
      />
      {byPerson.size === 0 ? (
        <p className="text-sm text-text-muted">Aucun paiement reçu pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {[...byPerson.entries()].map(([userId, entry]) => (
            <li key={userId}>
              {isTeamView ? <p className="mb-1.5 text-sm font-medium">{entry.name}</p> : null}
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                {holdingsByMode(entry.payments, base).map((bucket) => (
                  <div key={bucket.key} className="contents">
                    <dt className="text-text-muted">
                      {holdingLabel(bucket.method, bucket.provider, bucket.amount.currency, base)}
                    </dt>
                    <dd className="text-right font-semibold tabular">
                      {formatMoney(bucket.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Taux du dollar (EF-PRX-05, D-042) : affiché à tous, saisi par le gérant, jamais modifié. */
function ExchangeRateCard() {
  const { db, ctx, status } = useRestaurant();
  const canManage = hasPermission(ctx.role, "restaurant.exchange-rate.manage");
  const rates = useLiveQuery(
    () =>
      status === "ready"
        ? db.exchangeRates.orderBy("effectiveAt").reverse().limit(5).toArray()
        : [],
    [db, status],
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const current = rates?.[0];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await addExchangeRate(db, ctx, value);
      setValue("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const display = (rate: string) => formatMoney(moneyFromMajor(Number(rate), "CDF"));

  return (
    <Card aria-labelledby="rate-title">
      <CardHeader titleId="rate-title" title="Taux du dollar" />
      {current ? (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-md bg-bg-subtle text-text-muted"
          >
            <CircleDollarSign className="size-5" />
          </span>
          <div>
            <p className="text-xl font-semibold tabular">1 $ = {display(current.rate)}</p>
            <p className="text-xs text-text-muted">
              Saisi par {current.enteredByName || "le gérant"} le {formatDate(current.effectiveAt)}{" "}
              à {formatTime(current.effectiveAt)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Aucun taux saisi : les clients ne peuvent payer qu&apos;en francs.
        </p>
      )}

      {canManage ? (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-4 flex items-end gap-2">
          <Field label="Nouveau taux (FC pour 1 $)" error={error ?? undefined} className="flex-1">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="decimal"
                autoComplete="off"
                placeholder="2 850"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="action" disabled={isSaving || value.trim() === ""}>
            Enregistrer
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-text-muted">Seul le gérant saisit le taux du jour.</p>
      )}

      {rates && rates.length > 1 ? (
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer content-center text-text-muted">
            Taux précédents
          </summary>
          <ul className="flex flex-col gap-1">
            {rates.slice(1).map((rate) => (
              <li key={rate.id} className="flex justify-between gap-3 text-xs">
                <span className="text-text-muted">
                  {formatDate(rate.effectiveAt)} {formatTime(rate.effectiveAt)} ·{" "}
                  {rate.enteredByName}
                </span>
                <span className="tabular">{display(rate.rate)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/** Paiements reçus dans la journée, du plus récent au plus ancien. */
function PaymentsCard({
  payments,
  invoices,
  orders,
}: {
  payments: Payment[];
  invoices: AdvanceInvoice[];
  orders: Order[];
}) {
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const placeOf = (payment: Payment) => {
    const labels = new Set<string>();
    for (const allocation of payment.allocations) {
      const order = orderById.get(invoiceById.get(allocation.invoiceId)?.orderId ?? "");
      if (order) labels.add(orderPlaceLabel(order.mode, order.tableLabel));
    }
    return [...labels].join(", ") || "Commande";
  };

  return (
    <Card aria-labelledby="payments-title">
      <CardHeader titleId="payments-title" title="Paiements du jour" />
      {payments.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun paiement"
          description="Les encaissements de la journée apparaîtront ici."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {[...payments].reverse().map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {placeOf(payment)}{" "}
                  <span className="text-xs font-normal text-text-muted">
                    · {formatTime(payment.createdAt)}
                  </span>
                </p>
                <p className="text-xs text-text-muted">
                  {payment.method === "mobile-money" && payment.provider
                    ? PROVIDER_LABELS[payment.provider]
                    : PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.reference ? ` · réf. ${payment.reference}` : ""} ·{" "}
                  {payment.collectedByName}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold tabular">{formatMoney(payment.tendered)}</p>
                {payment.tendered.currency !== payment.baseAmount.currency ? (
                  <p className="text-xs text-text-muted tabular">
                    = {formatMoney(payment.baseAmount)}
                  </p>
                ) : null}
                {payment.change.amountMinor > 0 ? (
                  <p className="text-xs text-text-muted tabular">
                    Monnaie rendue {formatMoney(payment.change)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
