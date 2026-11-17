"use client";

import { Banknote, HandCoins, Search, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import { formatDate } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, sumMoney } from "@/shared/lib/money";
import { StatusLabel } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input } from "@/shared/ui/field";
import { Kpi } from "@/shared/ui/kpi";
import { Sheet } from "@/shared/ui/sheet";

import { debtAgeDays, outstandingOf, type CustomerDebt } from "../../domain/customers";
import { matchesSearch } from "../../domain/menu";
import type { Customer } from "../../domain/types";
import { useCustomersData, type CustomersData } from "../../offline/hooks";
import { createCustomer, setCustomerCreditLimit } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { orderPlaceLabel } from "../labels";
import { PaymentSheet } from "../payments/payment-sheet";
import { useRestaurant } from "../restaurant-provider";

/**
 * Clients et dettes (EF-VTE-05, EF-TRE-03, D-037, D-059) : encours de chaque
 * client, dettes avec leur ancienneté, remboursements encaissés en caisse,
 * plafond de crédit fixé par le gérant.
 */
export function CustomersScreen() {
  const { ctx } = useRestaurant();
  const data = useCustomersData();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [paying, setPaying] = useState<CustomerDebt | null>(null);

  if (!data) return null;
  const currency = ctx.settings.currency;
  const open = data.debts.filter((debt) => debt.remaining.amountMinor > 0);
  const debtors = new Set(open.map((debt) => debt.customerId));
  const visible = data.customers.filter((customer) =>
    matchesSearch(`${customer.name} ${customer.phone}`, query),
  );
  // Les débiteurs d'abord, puis l'ordre alphabétique.
  visible.sort((a, b) => Number(debtors.has(b.id)) - Number(debtors.has(a.id)));
  const payingOrder = paying ? data.orders.get(paying.orderId) : undefined;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Clients</h1>
          <p className="text-sm text-text-muted">Ventes à crédit et dettes à recouvrer.</p>
        </div>
        {hasPermission(ctx.role, "restaurant.customer.create") ? (
          <Button variant="action" onClick={() => setIsCreating(true)}>
            <UserPlus aria-hidden />
            Nouveau client
          </Button>
        ) : null}
      </div>

      <Card as="div" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={HandCoins}
          tone="peach"
          value={formatMoney(
            sumMoney(
              open.map((debt) => debt.remaining),
              currency,
            ),
          )}
          label="Encours total"
        />
        <Kpi icon={Users} tone="grey" value={debtors.size} label="Clients débiteurs" />
        <Kpi icon={Banknote} tone="yellow" value={open.length} label="Dettes ouvertes" />
      </Card>

      <Card aria-labelledby="customers-title">
        <h2 id="customers-title" className="sr-only">
          Liste des clients
        </h2>
        <label className="mb-4 flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 sm:max-w-sm">
          <Search aria-hidden className="size-4 text-text-muted" />
          <span className="sr-only">Rechercher un client</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou téléphone"
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-text-subtle focus:outline-none"
          />
        </label>
        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={data.customers.length === 0 ? "Aucun client" : "Aucun client ne correspond"}
            description={
              data.customers.length === 0
                ? "Une fiche client se crée lors d'une vente à crédit, ou ici."
                : "Modifiez la recherche."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {visible.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                data={data}
                onCollect={setPaying}
              />
            ))}
          </ul>
        )}
      </Card>

      <NewCustomerSheet open={isCreating} onOpenChange={setIsCreating} />
      <PaymentSheet
        open={paying !== null}
        onOpenChange={(isOpen) => !isOpen && setPaying(null)}
        title={
          paying
            ? `Remboursement · ${data.customers.find((c) => c.id === paying.customerId)?.name ?? ""}${payingOrder ? ` · ${payingOrder.number}` : ""}`
            : ""
        }
        invoices={
          paying ? data.invoices.filter((invoice) => paying.invoiceIds.includes(invoice.id)) : []
        }
        balances={data.balances}
      />
    </div>
  );
}

function CustomerRow({
  customer,
  data,
  onCollect,
}: {
  customer: Customer;
  data: CustomersData;
  onCollect: (debt: CustomerDebt) => void;
}) {
  const { ctx } = useRestaurant();
  const currency = ctx.settings.currency;
  const debts = data.debts
    .filter((debt) => debt.customerId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const outstanding = outstandingOf(customer.id, data.debts, currency);
  const canCollect = hasPermission(ctx.role, "restaurant.payment.collect");

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{customer.name}</p>
          <p className="text-xs text-text-muted tabular">{customer.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular">{formatMoney(outstanding)}</p>
          <p className="text-xs text-text-muted">
            {customer.creditLimit
              ? `dus sur un plafond de ${formatMoney(customer.creditLimit)}`
              : "dus, sans plafond"}
          </p>
        </div>
      </div>
      {debts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {debts.map((debt) => {
            const order = data.orders.get(debt.orderId);
            const age = debtAgeDays(debt.createdAt, data.now);
            const isSettled = debt.remaining.amountMinor <= 0;
            // Un serveur n'encaisse que ses ventes ; le gérant encaisse tout remboursement.
            const mayCollect =
              canCollect && (ctx.role !== "waiter" || order?.waiterId === ctx.userId);
            return (
              <li
                key={debt.requestId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bg-subtle px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p>
                    {order ? orderPlaceLabel(order.mode, order.tableLabel) : "Commande"}{" "}
                    <span className="text-xs text-text-muted tabular">{order?.number}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    Le {formatDate(debt.createdAt)} ·{" "}
                    {age === 0 ? "aujourd'hui" : `il y a ${age} jour${age > 1 ? "s" : ""}`} ·{" "}
                    {formatMoney(debt.amount)} à crédit
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isSettled ? (
                    <StatusLabel tone="success" className="text-xs">
                      Réglée
                    </StatusLabel>
                  ) : (
                    <span className="font-semibold tabular">
                      Reste {formatMoney(debt.remaining)}
                    </span>
                  )}
                  {!isSettled && mayCollect ? (
                    <Button size="sm" variant="action" onClick={() => onCollect(debt)}>
                      Encaisser
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-text-muted">Aucune vente à crédit.</p>
      )}
      {hasPermission(ctx.role, "restaurant.customer.manage") ? (
        <LimitForm customer={customer} />
      ) : null}
    </li>
  );
}

/** Plafond de crédit d'un client (D-037 ; gérant). */
function LimitForm({ customer }: { customer: Customer }) {
  const { db, ctx } = useRestaurant();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save(limit: number | null) {
    setError(null);
    try {
      await setCustomerCreditLimit(db, ctx, customer.id, limit);
      setValue("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(value.replace(/\s/g, "").replace(",", "."));
    void save(Number.isFinite(amount) && amount > 0 ? amount : Number.NaN);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={`Plafond de crédit de ${customer.name} (FC)`}
        inputMode="decimal"
        placeholder="Plafond (FC)"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-40 tabular"
      />
      <Button type="submit" size="sm" variant="outline" disabled={value.trim() === ""}>
        Fixer le plafond
      </Button>
      {customer.creditLimit ? (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          Retirer le plafond
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function NewCustomerSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { db, ctx } = useRestaurant();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setName("");
    setPhone("");
    setError(null);
    onOpenChange(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createCustomer(db, ctx, { name, phone });
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Nouveau client"
      description="Le nom et le téléphone sont exigés pour une vente à crédit (EF-ENC-03)."
      footer={
        <Button type="submit" form="customer-form" variant="action" className="w-full">
          <UserPlus aria-hidden />
          Créer la fiche
        </Button>
      }
    >
      <form
        id="customer-form"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <Field label="Nom du client">
          {({ id }) => (
            <Input
              id={id}
              autoComplete="off"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Téléphone">
          {({ id }) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
