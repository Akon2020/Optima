"use client";

import { Check, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, moneyFromMajor } from "@/shared/lib/money";
import { StatusLabel } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input, Textarea } from "@/shared/ui/field";

import { MIN_COMMENT_LENGTH, computeCashVariance } from "../../domain/closing";
import type { CashClosing } from "../../domain/types";
import type { ClosingData, DayData } from "../../offline/hooks";
import { declareCashClosing } from "../../offline/repository";
import { holdingLabel, orderPlaceLabel } from "../labels";
import { useRestaurant } from "../restaurant-provider";
import { cashVarianceLabel, parseCountedAmount } from "./closing-labels";

/**
 * Déclaration de caisse de la personne active (EF-CLO-01, 02, D-032) :
 * l'attendu par mode de paiement, le compté, l'écart figé à la déclaration,
 * la part de chaque point de service et les factures encore impayées
 * (RG-ENC-02).
 */
export function CashClosingPanel({ data, closing }: { data: DayData; closing: ClosingData }) {
  const { db, ctx } = useRestaurant();
  const base = ctx.settings.currency;
  const draft = closing.myDraft;
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const lines = draft.lines.map((line) => {
    const text = counted[line.key] ?? "";
    const value = parseCountedAmount(text);
    const countedMoney = value === null ? null : moneyFromMajor(value, line.expected.currency);
    return { ...line, text, value, countedMoney };
  });
  const hasVariance = lines.some(
    (line) =>
      line.countedMoney !== null &&
      computeCashVariance(line.expected, line.countedMoney).requiresComment,
  );
  const isComplete = lines.every((line) => line.value !== null);
  const pointName = (id: string) =>
    data.servicePoints.find((point) => point.id === id)?.name ?? "Point de service";
  const invoiceById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const mine = closing.status.cashClosings.filter((entry) => entry.userId === ctx.userId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await declareCashClosing(db, ctx, {
        counted: Object.fromEntries(lines.map((line) => [line.key, line.value ?? Number.NaN])),
        comment,
      });
      setCounted({});
      setComment("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const hasSomething = draft.lines.length > 0 || draft.unpaidInvoiceIds.length > 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <Card aria-labelledby="my-cash-title">
        <CardHeader
          titleId="my-cash-title"
          title="Ma caisse"
          description="Comptez l'argent que vous détenez, mode par mode, puis déclarez-le. L'écart est figé à la déclaration."
        />
        {!hasSomething ? (
          <EmptyState
            icon={Wallet}
            title="Rien à déclarer"
            description={
              mine.length > 0
                ? "Votre caisse est déclarée. Un nouvel encaissement ouvrira une nouvelle déclaration."
                : "Vous n'avez encaissé aucun paiement depuis votre dernière déclaration."
            }
          />
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}

            {lines.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {lines.map((line) => {
                  const label = holdingLabel(
                    line.method,
                    line.provider,
                    line.expected.currency,
                    base,
                  );
                  const variance =
                    line.countedMoney === null
                      ? null
                      : cashVarianceLabel(line.expected, line.countedMoney);
                  return (
                    <li
                      key={line.key}
                      className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_200px_140px] sm:items-center sm:gap-4"
                    >
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-text-muted">
                          Attendu{" "}
                          <span className="font-semibold text-text tabular">
                            {formatMoney(line.expected)}
                          </span>
                        </p>
                      </div>
                      <Field label={`Compté (${line.expected.currency === "USD" ? "$" : "FC"})`}>
                        {({ id }) => (
                          <Input
                            id={id}
                            inputMode="decimal"
                            autoComplete="off"
                            value={line.text}
                            onChange={(event) => {
                              setCounted((current) => ({
                                ...current,
                                [line.key]: event.target.value,
                              }));
                              setError(null);
                            }}
                            className="tabular"
                          />
                        )}
                      </Field>
                      <div className="sm:text-right" aria-live="polite">
                        {variance ? (
                          <StatusLabel tone={variance.tone} className="text-sm">
                            {variance.label}
                          </StatusLabel>
                        ) : (
                          <span className="text-xs text-text-muted">À compter</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {draft.byServicePoint.length > 0 ? (
              <div className="rounded-md bg-bg-subtle p-3 text-sm">
                <p className="mb-1.5 text-xs font-medium">À reverser à chaque point de service</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                  {draft.byServicePoint.map((entry) => (
                    <div key={entry.servicePointId} className="contents">
                      <dt className="text-text-muted">{pointName(entry.servicePointId)}</dt>
                      <dd className="text-right tabular">{formatMoney(entry.amount)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {draft.unpaidInvoiceIds.length > 0 ? (
              <div className="rounded-md bg-warning-subtle p-3 text-sm">
                <p className="font-medium">
                  {draft.unpaidInvoiceIds.length} facture
                  {draft.unpaidInvoiceIds.length > 1 ? "s" : ""} impayée
                  {draft.unpaidInvoiceIds.length > 1 ? "s" : ""} à votre nom
                </p>
                <p className="text-xs">
                  Elles restent à votre nom jusqu&apos;à leur règlement (RG-ENC-02) : encaissez-les
                  depuis l&apos;écran Caisse si le client paie.
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {draft.unpaidInvoiceIds.map((id) => {
                    const invoice = invoiceById.get(id);
                    const remaining = data.balances.get(id)?.remaining;
                    return (
                      <li key={id} className="flex justify-between gap-3 text-xs">
                        <span>
                          {invoice ? orderPlaceLabel(invoice.mode, invoice.tableLabel) : "Facture"}{" "}
                          · <span className="tabular">{invoice?.number ?? id}</span>
                        </span>
                        <span className="tabular">{remaining ? formatMoney(remaining) : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <Field
              label="Commentaire"
              optional={!hasVariance}
              hint={
                hasVariance
                  ? `Obligatoire : expliquez le manquant ou l'excédent (${MIN_COMMENT_LENGTH} caractères au moins).`
                  : undefined
              }
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  rows={2}
                  maxLength={300}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              )}
            </Field>

            <Button type="submit" variant="action" disabled={isSaving || !isComplete}>
              <Check aria-hidden />
              Déclarer ma caisse
            </Button>
          </form>
        )}
      </Card>

      {mine.length > 0 ? <DeclaredClosings closings={mine} title="Mes déclarations" /> : null}
    </div>
  );
}

/** Déclarations figées : attendu, compté, écart, commentaire (RG-CLO-01 : nommées). */
export function DeclaredClosings({
  closings,
  title,
}: {
  closings: readonly CashClosing[];
  title: string;
}) {
  const { ctx } = useRestaurant();
  const base = ctx.settings.currency;
  return (
    <Card aria-labelledby="declared-title">
      <CardHeader titleId="declared-title" title={title} />
      <ul className="flex flex-col divide-y divide-border">
        {closings.map((entry) => (
          <li key={entry.id} className="py-3 text-sm">
            <p className="font-medium">
              {entry.userName}{" "}
              <span className="text-xs font-normal text-text-muted">
                · déclarée à {formatTime(entry.declaredAt)} · appareil {entry.deviceCode}
              </span>
            </p>
            {entry.lines.length === 0 ? (
              <p className="text-xs text-text-muted">Aucun encaissement.</p>
            ) : (
              <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {entry.lines.map((line) => {
                  const variance = cashVarianceLabel(line.expected, line.counted);
                  return (
                    <div key={line.key} className="contents">
                      <dt className="text-text-muted">
                        {holdingLabel(line.method, line.provider, line.expected.currency, base)} :{" "}
                        <span className="tabular">{formatMoney(line.counted)}</span> sur{" "}
                        <span className="tabular">{formatMoney(line.expected)}</span>
                      </dt>
                      <dd className="text-right">
                        <StatusLabel tone={variance.tone} className="text-xs">
                          {variance.label}
                        </StatusLabel>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {entry.unpaidInvoiceIds.length > 0 ? (
              <p className="mt-1 text-xs text-text-muted">
                {entry.unpaidInvoiceIds.length} facture(s) impayée(s) à son nom (RG-ENC-02)
              </p>
            ) : null}
            {entry.comment ? (
              <p className="mt-1 text-xs">
                <span className="text-text-muted">Commentaire :</span> {entry.comment}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
