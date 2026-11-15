"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, CircleDashed, FileText, Printer, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, sumMoney } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { Field, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import { dayClosingIssues } from "../../domain/closing";
import type { ClosingData, DayData } from "../../offline/hooks";
import { useIsOnline } from "../../offline/hooks";
import { validateDay } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { useRestaurant } from "../restaurant-provider";
import { DeclaredClosings } from "./cash-closing-panel";
import { DayReport } from "./day-report";

/**
 * Validation de la journée par le gérant (EF-CLO-04) : ce qui manque encore,
 * les caisses déclarées, les impayés, puis la validation et le rapport.
 */
export function DayClosingPanel({ data, closing }: { data: DayData; closing: ClosingData }) {
  const { db, ctx, isDemo, syncNow } = useRestaurant();
  const isOnline = useIsOnline();
  const status = closing.status;
  const canValidate = hasPermission(ctx.role, "restaurant.closing.validate");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [reportDay, setReportDay] = useState<string | null>(null);

  const operation = useLiveQuery(
    () => (operationId ? db.outbox.get(operationId) : undefined),
    [db, operationId],
  );
  const validated = useLiveQuery(
    () => db.dayClosings.orderBy("validatedAt").reverse().limit(7).toArray(),
    [db],
  );

  const issues = dayClosingIssues({
    isAlreadyValidated: status.isValidated,
    pointsMissingMorningStock: status.pointsMissingMorningStock.map((point) => point.name),
    pointsNotCounted: status.pointsNotCounted.map((point) => point.name),
    undeclaredCollectors: status.undeclared.map((entry) => entry.name),
    pendingOperations: isDemo ? 0 : closing.pendingOperations,
    isOnline: isDemo || isOnline,
  });
  const requiredPoints = data.servicePoints.filter(
    (point) => (closing.stockDrafts.get(point.id) ?? []).length > 0,
  );
  const unpaid = data.invoices.filter((invoice) => {
    const balance = data.balances.get(invoice.id);
    return balance && balance.status !== "cancelled" && balance.remaining.amountMinor > 0;
  });
  const isSending = operation?.status === "pending";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await validateDay(db, ctx, {
        comment,
        isOnline,
        writeLocally: isDemo,
      });
      setComment("");
      if (isDemo) {
        setReportDay(result.day);
      } else {
        setOperationId(result.operationId);
        syncNow();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <Card aria-labelledby="day-check-title">
        <CardHeader
          titleId="day-check-title"
          title="Avant de valider"
          description="La journée se valide quand tout est saisi, compté, déclaré et envoyé au serveur."
        />
        <ul className="flex flex-col gap-2 text-sm">
          {requiredPoints.map((point) => {
            const hasMorning = !status.pointsMissingMorningStock.some((p) => p.id === point.id);
            const isCounted = status.stockCounts.has(point.id);
            return (
              <CheckItem
                key={point.id}
                isDone={hasMorning && isCounted}
                label={`${point.name} : ${hasMorning ? "stock du matin saisi" : "stock du matin manquant"}, ${isCounted ? "stock compté" : "stock à compter"}`}
              />
            );
          })}
          {status.cashClosings.map((entry) => (
            <CheckItem
              key={entry.id}
              isDone
              label={`${entry.userName} : caisse déclarée à ${formatTime(entry.declaredAt)}`}
            />
          ))}
          {status.undeclared.map((entry) => (
            <CheckItem
              key={entry.userId}
              isDone={false}
              label={`${entry.name} : caisse à déclarer (${entry.payments} paiement${entry.payments > 1 ? "s" : ""})`}
            />
          ))}
          {!isDemo ? (
            <CheckItem
              isDone={closing.pendingOperations === 0 && isOnline}
              label={
                !isOnline
                  ? "Appareil hors connexion"
                  : closing.pendingOperations > 0
                    ? `${closing.pendingOperations} opération(s) à envoyer au serveur`
                    : "Tout est envoyé au serveur"
              }
            />
          ) : null}
        </ul>

        {unpaid.length > 0 ? (
          <p className="mt-4 rounded-md bg-warning-subtle px-3 py-2 text-sm">
            {unpaid.length} facture{unpaid.length > 1 ? "s" : ""} impayée
            {unpaid.length > 1 ? "s" : ""} (
            {formatMoney(
              sumMoney(
                unpaid.map((invoice) => data.balances.get(invoice.id)?.remaining ?? invoice.total),
                ctx.settings.currency,
              ),
            )}
            ) : elles restent au nom de leur serveur et figurent au rapport (RG-ENC-02).
          </p>
        ) : null}

        {canValidate ? (
          <form onSubmit={(event) => void onSubmit(event)} className="mt-4 flex flex-col gap-3">
            {error ? (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}
            {operation?.status === "rejected" ? (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
                Le serveur a refusé la validation : {operation.rejection?.message}
              </p>
            ) : null}
            {isSending ? (
              <p className="rounded-md bg-bg-subtle px-3 py-2 text-sm" aria-live="polite">
                Validation envoyée au serveur…
              </p>
            ) : null}
            <Field label="Commentaire du gérant" optional>
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={300}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="action"
              className="self-start"
              disabled={issues.length > 0 || isSending}
            >
              <ShieldCheck aria-hidden />
              Valider la journée
            </Button>
            {issues.length > 0 ? (
              <p className="text-xs text-text-muted">
                Validation impossible pour l&apos;instant : {issues[0]?.message}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="mt-4 text-sm text-text-muted">Seul le gérant valide la journée.</p>
        )}
      </Card>

      {status.cashClosings.length > 0 ? (
        <DeclaredClosings closings={status.cashClosings} title="Caisses déclarées" />
      ) : null}

      {validated && validated.length > 0 ? (
        <Card aria-labelledby="validated-title">
          <CardHeader titleId="validated-title" title="Journées validées" />
          <ul className="flex flex-col divide-y divide-border">
            {validated.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">
                    Journée du {formatDate(`${entry.day}T12:00:00.000Z`)}{" "}
                    <Badge tone="success">Validée</Badge>
                  </p>
                  <p className="text-xs text-text-muted">
                    Par {entry.validatedByName || "le gérant"} le {formatDate(entry.validatedAt)} à{" "}
                    {formatTime(entry.validatedAt)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setReportDay(entry.day)}>
                  <FileText aria-hidden />
                  Rapport
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Sheet
        open={reportDay !== null}
        onOpenChange={(open) => !open && setReportDay(null)}
        title="Rapport de clôture"
        className="sm:w-[760px]"
        footer={
          <Button variant="action" className="w-full" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimer ou enregistrer en PDF
          </Button>
        }
      >
        {reportDay ? (
          <>
            <DayReport day={reportDay} />
            <div className="print-area hidden print:block">
              <DayReport day={reportDay} />
            </div>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

function CheckItem({ isDone, label }: { isDone: boolean; label: string }) {
  const Icon = isDone ? CircleCheck : CircleDashed;
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden
        className={
          isDone ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0 text-text-muted"
        }
      />
      <span>
        <span className="sr-only">{isDone ? "Fait : " : "À faire : "}</span>
        {label}
      </span>
    </li>
  );
}
