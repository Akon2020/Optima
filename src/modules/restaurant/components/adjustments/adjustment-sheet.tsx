"use client";

import { Ban, Check, Percent } from "lucide-react";
import { useState, type FormEvent } from "react";

import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, type Money } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import { MIN_REASON_LENGTH } from "../../domain/adjustment";
import type { AdjustmentKind } from "../../domain/types";
import { requestAdjustment } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { useRestaurant } from "../restaurant-provider";

/** Montant saisi à la française ; `null` s'il est illisible. */
function parseAmount(text: string): number | null {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

/**
 * Demande d'annulation ou de remise sur une commande (RG-CMD-02, RG-ENC-01,
 * D-058). Un serveur demande : la demande attend le gérant. Un gérant qui
 * agit lui-même valide dans le même geste.
 */
export function AdjustmentSheet({
  kind,
  orderId,
  title,
  remaining,
  onOpenChange,
}: {
  kind: AdjustmentKind | null;
  orderId: string;
  title: string;
  remaining: Money;
  onOpenChange: (open: boolean) => void;
}) {
  const { db, ctx } = useRestaurant();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isManager = hasPermission(ctx.role, "restaurant.adjustment.approve");

  function close() {
    setReason("");
    setAmount("");
    setError(null);
    onOpenChange(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setIsSaving(true);
    setError(null);
    try {
      await requestAdjustment(db, ctx, {
        kind,
        orderId,
        reason,
        discountMajor: kind === "discount" ? parseAmount(amount) : null,
      });
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const isCancel = kind === "cancel";
  const verb = isCancel
    ? isManager
      ? "Annuler la commande"
      : "Demander l'annulation"
    : isManager
      ? "Accorder la remise"
      : "Demander la remise";

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => !open && close()}
      title={`${isCancel ? "Annulation" : "Remise"} · ${title}`}
      description={
        isManager
          ? "Vous êtes gérant : votre demande est validée aussitôt, et tracée au journal."
          : "La demande part au gérant, qui la valide ou la refuse. Rien ne change avant sa décision."
      }
      footer={
        <Button
          type="submit"
          form="adjustment-form"
          variant={isCancel ? "danger" : "action"}
          className="w-full"
          disabled={isSaving || reason.trim().length < MIN_REASON_LENGTH}
        >
          {isManager ? (
            <Check aria-hidden />
          ) : isCancel ? (
            <Ban aria-hidden />
          ) : (
            <Percent aria-hidden />
          )}
          {verb}
        </Button>
      }
    >
      <form
        id="adjustment-form"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        {isCancel ? (
          <p className="text-sm text-text-muted">
            Les factures d&apos;avance gardent leur numéro et portent la mention « annulée » ; le
            stock du jour est rétabli (RG-CMD-02). Une facture déjà encaissée ne s&apos;annule pas.
          </p>
        ) : (
          <Field
            label="Montant de la remise (FC)"
            hint={`Au plus le reste à payer : ${formatMoney(remaining)}.`}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="tabular"
              />
            )}
          </Field>
        )}
        <Field label="Motif" hint="Obligatoire : il figure au journal d'audit.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={3}
              maxLength={160}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
