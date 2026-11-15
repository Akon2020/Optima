"use client";

import { Banknote, Check, Smartphone } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { formatDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import {
  formatMoney,
  moneyFromMajor,
  subtractMoney,
  toMajor,
  type Currency,
} from "@/shared/lib/money";
import { StatusLabel } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Field, Input, Select } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import {
  minimumTendered,
  remainingDue,
  settlePayment,
  type InvoiceBalance,
} from "../../domain/payment";
import type { AdvanceInvoice, MobileMoneyProvider, PaymentMethod } from "../../domain/types";
import { useDayData } from "../../offline/hooks";
import { recordPayment, releaseTable } from "../../offline/repository";
import { PAYMENT_STATUS, PROVIDER_LABELS } from "../labels";
import { useRestaurant } from "../restaurant-provider";

const CURRENCY_LABELS: Record<Currency, string> = { CDF: "Francs (FC)", USD: "Dollars ($)" };
const CURRENCY_SYMBOLS: Record<Currency, string> = { CDF: "FC", USD: "$" };

/** Montant saisi à la française (« 22 000 », « 15,79 ») ; `null` s'il est illisible. */
function parseAmount(text: string): number | null {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

function amountText(value: number): string {
  return String(value).replace(".", ",");
}

/**
 * Encaissement d'une ou plusieurs factures d'avance (EF-ENC-02, D-032,
 * D-033) : espèces en francs ou en dollars au taux du jour, ou Mobile Money ;
 * monnaie à rendre en francs ; paiement partiel possible. Sur une table, le
 * paiement qui solde l'addition propose de libérer la table.
 */
export function PaymentSheet({
  open,
  onOpenChange,
  title,
  invoices,
  tableId = null,
  balances: balancesOverride,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  invoices: readonly AdvanceInvoice[];
  tableId?: string | null;
  /** Soldes calculés par l'écran appelant (dettes clients plus anciennes que la journée). */
  balances?: ReadonlyMap<string, InvoiceBalance>;
}) {
  const { db, ctx } = useRestaurant();
  const data = useDayData();
  const base = ctx.settings.currency;
  const foreign: Currency = base === "CDF" ? "USD" : "CDF";

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [currency, setCurrency] = useState<Currency>(base);
  const [provider, setProvider] = useState<MobileMoneyProvider>("mpesa");
  const [reference, setReference] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const [shouldRelease, setShouldRelease] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const active = invoices.filter((invoice) => invoice.paymentStatus !== "cancelled");
  const balances = balancesOverride ?? data?.balances;
  const due = balances
    ? remainingDue(
        active.map((invoice) => invoice.id),
        balances,
        base,
      )
    : moneyFromMajor(0, base);
  const rate = data?.exchangeRate ?? null;
  const isRateOld = rate !== null && data !== undefined && rate.effectiveAt < data.dayStart;

  const defaultAmount =
    currency === base ? due : rate ? minimumTendered(due, currency, rate.rate) : null;
  const text = typed ?? (defaultAmount ? amountText(toMajor(defaultAmount)) : "");
  const amount = parseAmount(text);
  const settlement =
    amount === null
      ? null
      : settlePayment({
          due,
          tendered: moneyFromMajor(amount, currency),
          method,
          rate: rate?.rate ?? null,
        });
  const settlesAll = settlement?.ok === true && settlement.applied.amountMinor === due.amountMinor;

  function reset() {
    setMethod("cash");
    setCurrency(base);
    setReference("");
    setTyped(null);
    setShouldRelease(true);
    setError(null);
  }

  function chooseCurrency(next: Currency) {
    setCurrency(next);
    setTyped(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (amount === null) {
      setError("Saisissez le montant reçu, par exemple 22 000 ou 15,79.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await recordPayment(db, ctx, {
        invoiceIds: active.map((invoice) => invoice.id),
        method,
        provider: method === "mobile-money" ? provider : null,
        reference: method === "mobile-money" ? reference : null,
        currency,
        amountMajor: amount,
      });
      if (tableId && settlesAll && shouldRelease) await releaseTable(db, ctx, tableId);
      reset();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const pointName = (id: string) =>
    data?.servicePoints.find((point) => point.id === id)?.name ?? "Point de service";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={`Encaisser · ${title}`}
      description={`Reste à payer : ${formatMoney(due)}`}
      footer={
        due.amountMinor > 0 ? (
          <Button
            type="submit"
            form="payment-form"
            variant="action"
            className="w-full"
            disabled={isSaving || settlement?.ok !== true}
          >
            <Check aria-hidden />
            {settlement?.ok
              ? `Encaisser ${formatMoney(moneyFromMajor(amount ?? 0, currency))}`
              : "Encaisser"}
          </Button>
        ) : null
      }
    >
      {due.amountMinor <= 0 ? (
        <p className="rounded-md bg-success-subtle px-3 py-2 text-sm">
          Tout est payé : il n&apos;y a plus rien à encaisser.
        </p>
      ) : (
        <form
          id="payment-form"
          onSubmit={(event) => void onSubmit(event)}
          className="flex flex-col gap-4"
        >
          {error ? (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <ul aria-label="Factures à régler" className="flex flex-col gap-1.5 text-sm">
            {active.map((invoice) => {
              const balance = balances?.get(invoice.id);
              const status = PAYMENT_STATUS[balance?.status ?? "unpaid"];
              return (
                <li key={invoice.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">{pointName(invoice.servicePointId)}</span>{" "}
                    <span className="text-xs text-text-muted tabular">{invoice.number}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusLabel tone={status.tone} className="text-xs">
                      {status.label}
                    </StatusLabel>
                    <span className="tabular">
                      {formatMoney(balance?.remaining ?? invoice.total)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium">Mode de paiement</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "cash", label: "Espèces", icon: Banknote },
                  { value: "mobile-money", label: "Mobile Money", icon: Smartphone },
                ] as const
              ).map((option) => (
                <ChoiceButton
                  key={option.value}
                  isSelected={method === option.value}
                  onClick={() => {
                    setMethod(option.value);
                    setError(null);
                  }}
                >
                  <option.icon aria-hidden className="size-4" />
                  {option.label}
                </ChoiceButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium">Devise</legend>
            <div className="grid grid-cols-2 gap-2">
              {([base, foreign] as const).map((option) => (
                <ChoiceButton
                  key={option}
                  isSelected={currency === option}
                  disabled={option !== base && rate === null}
                  onClick={() => chooseCurrency(option)}
                >
                  {CURRENCY_LABELS[option]}
                </ChoiceButton>
              ))}
            </div>
            <p
              className={cn(
                "text-xs",
                isRateOld ? "rounded-md bg-warning-subtle px-3 py-2 text-text" : "text-text-muted",
              )}
            >
              {rate === null
                ? "Le gérant n'a pas encore saisi le taux du dollar : encaissement en francs seulement."
                : isRateOld
                  ? `Taux du ${formatDate(rate.effectiveAt)} (1 $ = ${formatMoney(moneyFromMajor(Number(rate.rate), "CDF"))}) : demandez au gérant celui du jour.`
                  : `Taux du jour : 1 $ = ${formatMoney(moneyFromMajor(Number(rate.rate), "CDF"))}, saisi par ${rate.enteredByName || "le gérant"} à ${formatTime(rate.effectiveAt)}.`}
            </p>
          </fieldset>

          {method === "mobile-money" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Opérateur">
                {({ id }) => (
                  <Select
                    id={id}
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as MobileMoneyProvider)}
                  >
                    {(Object.keys(PROVIDER_LABELS) as MobileMoneyProvider[]).map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Référence de la transaction" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    value={reference}
                    maxLength={40}
                    autoComplete="off"
                    onChange={(event) => setReference(event.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <Field
            label={`Montant reçu (${CURRENCY_SYMBOLS[currency]})`}
            hint={
              currency !== base && defaultAmount
                ? `Il faut au moins ${formatMoney(defaultAmount)} pour tout régler.`
                : "Un montant inférieur au reste à payer enregistre un paiement partiel."
            }
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setError(null);
                }}
                className="text-lg font-semibold tabular"
              />
            )}
          </Field>

          {settlement ? (
            settlement.ok ? (
              <dl
                aria-live="polite"
                className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-md bg-bg-subtle p-3 text-sm"
              >
                {currency !== base ? (
                  <>
                    <dt className="text-text-muted">Contre-valeur</dt>
                    <dd className="text-right tabular">{formatMoney(settlement.baseAmount)}</dd>
                  </>
                ) : null}
                <dt className="text-text-muted">Réglé sur l&apos;addition</dt>
                <dd className="text-right tabular">{formatMoney(settlement.applied)}</dd>
                {settlement.change.amountMinor > 0 ? (
                  <>
                    <dt className="font-semibold">Monnaie à rendre</dt>
                    <dd className="text-right text-lg font-semibold tabular">
                      {formatMoney(settlement.change)}
                    </dd>
                  </>
                ) : null}
                {!settlesAll ? (
                  <>
                    <dt className="text-text-muted">Reste après ce paiement</dt>
                    <dd className="text-right tabular">
                      {formatMoney(subtractMoney(due, settlement.applied))}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm">{settlement.message}</p>
            )
          ) : null}

          {tableId && settlesAll ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={shouldRelease}
                onChange={(event) => setShouldRelease(event.target.checked)}
                className="size-5 accent-action"
              />
              Libérer la table : les clients sont partis
            </label>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}

function ChoiceButton({
  isSelected,
  disabled = false,
  onClick,
  children,
}: {
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "border-action bg-action/10 text-text"
          : "border-border-strong text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
