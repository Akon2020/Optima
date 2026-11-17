"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Ban, Check, HandCoins, Percent, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, type Money } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import { MIN_REASON_LENGTH } from "../../domain/adjustment";
import { normalizePhone } from "../../domain/customers";
import { matchesSearch } from "../../domain/menu";
import type { AdjustmentKind } from "../../domain/types";
import { createCustomer, requestAdjustment } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { useRestaurant } from "../restaurant-provider";

/** Montant saisi à la française ; `null` s'il est illisible. */
function parseAmount(text: string): number | null {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

const TITLES: Record<AdjustmentKind, string> = {
  cancel: "Annulation",
  discount: "Remise",
  credit: "Vente à crédit",
};

/**
 * Demande d'annulation, de remise ou de vente à crédit sur une commande
 * (RG-CMD-02, RG-ENC-01, EF-ENC-03, D-058, D-059). Un serveur demande : la
 * demande attend le gérant. Un gérant qui agit lui-même valide dans le même
 * geste.
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
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isManager = hasPermission(ctx.role, "restaurant.adjustment.approve");
  const customers = useLiveQuery(() => db.customers.orderBy("phone").toArray(), [db]) ?? [];
  const found = customers
    .filter((customer) => matchesSearch(`${customer.name} ${customer.phone}`, search))
    .slice(0, 6);

  function close() {
    setReason("");
    setAmount("");
    setCustomerId(null);
    setIsNewCustomer(false);
    setSearch("");
    setNewName("");
    setNewPhone("");
    setError(null);
    onOpenChange(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setIsSaving(true);
    setError(null);
    try {
      let debtor = customerId;
      if (kind === "credit" && isNewCustomer) {
        debtor = (await createCustomer(db, ctx, { name: newName, phone: newPhone })).id;
        setCustomerId(debtor);
        setIsNewCustomer(false);
      }
      await requestAdjustment(db, ctx, {
        kind,
        orderId,
        reason,
        discountMajor: kind === "discount" ? parseAmount(amount) : null,
        customerId: kind === "credit" ? debtor : null,
      });
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const verb =
    kind === "cancel"
      ? isManager
        ? "Annuler la commande"
        : "Demander l'annulation"
      : kind === "discount"
        ? isManager
          ? "Accorder la remise"
          : "Demander la remise"
        : isManager
          ? "Vendre à crédit"
          : "Demander le crédit";
  const Icon = isManager
    ? Check
    : kind === "cancel"
      ? Ban
      : kind === "discount"
        ? Percent
        : HandCoins;
  const hasDebtor = kind !== "credit" || customerId !== null || isNewCustomer;

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(open) => !open && close()}
      title={`${kind ? TITLES[kind] : ""} · ${title}`}
      description={
        isManager
          ? "Vous êtes gérant : votre demande est validée aussitôt, et tracée au journal."
          : "La demande part au gérant, qui la valide ou la refuse. Rien ne change avant sa décision."
      }
      footer={
        <Button
          type="submit"
          form="adjustment-form"
          variant={kind === "cancel" ? "danger" : "action"}
          className="w-full"
          disabled={isSaving || reason.trim().length < MIN_REASON_LENGTH || !hasDebtor}
        >
          <Icon aria-hidden />
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
        {kind === "cancel" ? (
          <p className="text-sm text-text-muted">
            Les factures d&apos;avance gardent leur numéro et portent la mention « annulée » ; le
            stock du jour est rétabli (RG-CMD-02). Une facture déjà encaissée ne s&apos;annule pas.
          </p>
        ) : null}
        {kind === "discount" ? (
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
        ) : null}
        {kind === "credit" ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm">
              Le reste à payer, <span className="font-semibold">{formatMoney(remaining)}</span>,
              devient la dette du client (EF-ENC-03).
            </legend>
            {!isNewCustomer ? (
              <>
                <Field label="Client">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="search"
                      placeholder="Nom ou téléphone"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  )}
                </Field>
                {found.length > 0 ? (
                  <ul aria-label="Clients" className="flex flex-col gap-1">
                    {found.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          aria-pressed={customerId === customer.id}
                          onClick={() => setCustomerId(customer.id)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-between gap-3 rounded-md border px-3 text-left text-sm",
                            customerId === customer.id
                              ? "border-action bg-action/10"
                              : "border-border hover:bg-bg-subtle",
                          )}
                        >
                          <span className="font-medium">{customer.name}</span>
                          <span className="text-xs text-text-muted tabular">{customer.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-muted">Aucun client ne correspond.</p>
                )}
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setIsNewCustomer(true);
                    setCustomerId(null);
                  }}
                >
                  <UserPlus aria-hidden />
                  Nouveau client
                </Button>
              </>
            ) : (
              <>
                <Field label="Nom du client">
                  {({ id }) => (
                    <Input
                      id={id}
                      autoComplete="off"
                      maxLength={80}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Téléphone"
                  hint={
                    newPhone.trim() !== "" && normalizePhone(newPhone) === null
                      ? "Numéro incomplet : 9 à 15 chiffres."
                      : "Exigé pour une vente à crédit."
                  }
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      value={newPhone}
                      onChange={(event) => setNewPhone(event.target.value)}
                    />
                  )}
                </Field>
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => setIsNewCustomer(false)}
                >
                  Choisir un client existant
                </Button>
              </>
            )}
          </fieldset>
        ) : null}
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
