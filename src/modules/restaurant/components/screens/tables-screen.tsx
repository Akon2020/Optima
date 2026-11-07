"use client";

import {
  Archive,
  Armchair,
  Check,
  Clock,
  DoorOpen,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { formatElapsed, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, sumMoney } from "@/shared/lib/money";
import { Badge, StatusLabel } from "@/shared/ui/badge";
import { Button, IconButton, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/field";
import { Kpi } from "@/shared/ui/kpi";
import { Sheet } from "@/shared/ui/sheet";
import { Tabs } from "@/shared/ui/tabs";

import { orderPrepStatus } from "../../domain/dashboard";
import { nextTableLabel, shortTableLabel, type TableSession } from "../../domain/tables";
import type { DiningTable } from "../../domain/types";
import { useDayData, type DayData } from "../../offline/hooks";
import { addTable, releaseTable, renameTable, setTableArchived } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { PREP_STATUS } from "../labels";
import { summarizeLines } from "../orders/order-rows";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";
import { TableBillTicket } from "../tables/table-bill-ticket";

type Filter = "all" | "occupied" | "free";

function newOrderHref(slug: string, tableId: string): string {
  return `${restaurantHref(slug, "commandes/nouvelle")}?table=${encodeURIComponent(tableId)}`;
}

/** Tables de la salle (EF-RES-04, EF-CMD-04, EF-CMD-05). */
export function TablesScreen() {
  const { slug, ctx } = useRestaurant();
  const data = useDayData();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);

  if (!data) return null;

  const active = data.tables.filter((table) => table.archivedAt === null);
  const occupied = active.filter((table) => data.sessions.has(table.id));
  const openTotal = sumMoney(
    occupied.map(
      (table) =>
        data.sessions.get(table.id)?.total ?? { amountMinor: 0, currency: ctx.settings.currency },
    ),
    ctx.settings.currency,
  );
  const visible = active.filter((table) =>
    filter === "all"
      ? true
      : filter === "occupied"
        ? data.sessions.has(table.id)
        : !data.sessions.has(table.id),
  );
  const selected = active.find((table) => table.id === selectedId) ?? null;
  const selectedSession = selected ? data.sessions.get(selected.id) : undefined;
  const canManage = hasPermission(ctx.role, "restaurant.table.manage");

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Tables</h1>
          <p className="text-sm text-text-muted">
            Touchez une table libre pour commander, une table occupée pour son addition.
          </p>
        </div>
        {canManage ? (
          <Button variant="outline" onClick={() => setIsManaging(true)}>
            <Settings2 aria-hidden />
            Gérer les tables
          </Button>
        ) : null}
      </div>

      <Card as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi
          icon={Armchair}
          tone="peach"
          value={`${occupied.length}/${active.length}`}
          label="Tables occupées"
        />
        <Kpi
          icon={DoorOpen}
          tone="green"
          value={active.length - occupied.length}
          label="Tables libres"
        />
        <Kpi
          icon={TrendingUp}
          tone="yellow"
          value={formatMoney(openTotal)}
          label="En cours sur les tables"
          className="col-span-2 sm:col-span-1"
        />
      </Card>

      <div className="rounded-card bg-surface px-4 shadow-card">
        <Tabs<Filter>
          label="Filtrer les tables"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "Toutes", count: active.length },
            { value: "occupied", label: "Occupées", count: occupied.length },
            { value: "free", label: "Libres", count: active.length - occupied.length },
          ]}
        />
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={Armchair}
            title="Aucune table"
            description={
              canManage
                ? "Ajoutez les tables de la salle."
                : "Le gérant n'a pas encore créé de table."
            }
            action={
              canManage ? (
                <Button variant="action" onClick={() => setIsManaging(true)}>
                  <Plus aria-hidden />
                  Ajouter des tables
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Armchair}
            title={
              filter === "occupied" ? "Aucune table occupée" : "Toutes les tables sont occupées"
            }
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-6">
          {visible.map((table) => (
            <li key={table.id}>
              <TableTile
                table={table}
                session={data.sessions.get(table.id)}
                now={data.now}
                href={newOrderHref(slug, table.id)}
                onOpen={() => setSelectedId(table.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <TableSheet
        table={selected}
        session={selectedSession}
        now={data.now}
        onClose={() => setSelectedId(null)}
      />
      {canManage ? (
        <ManageTablesSheet open={isManaging} onOpenChange={setIsManaging} data={data} />
      ) : null}
    </div>
  );
}

function TableTile({
  table,
  session,
  now,
  href,
  onOpen,
}: {
  table: DiningTable;
  session: TableSession | undefined;
  now: string;
  href: string;
  onOpen: () => void;
}) {
  const label = shortTableLabel(table.label);
  const isNumeric = /^\d+$/.test(label);

  if (!session) {
    return (
      <Link
        href={href}
        aria-label={`${table.label}, libre. Prendre une commande`}
        className="group flex h-full min-h-36 flex-col justify-between rounded-card border-2 border-dashed border-border-strong bg-surface/60 p-4 transition-colors duration-150 hover:border-action"
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "font-semibold text-text-muted tabular",
              isNumeric ? "text-3xl" : "text-lg",
            )}
          >
            {label}
          </span>
          <Badge tone="neutral">Libre</Badge>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted group-hover:text-text">
          <Plus aria-hidden className="size-4" />
          Commander
        </span>
      </Link>
    );
  }

  const status = PREP_STATUS[session.prepStatus];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${table.label}, occupée, ${formatMoney(session.total)}. Voir l'addition`}
      className="flex h-full min-h-36 w-full flex-col justify-between gap-3 rounded-card bg-surface p-4 text-left shadow-card ring-2 ring-accent/60 transition-shadow duration-150 hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-semibold tabular", isNumeric ? "text-3xl" : "text-lg")}>
          {label}
        </span>
        <Badge tone="accent">Occupée</Badge>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular">{formatMoney(session.total)}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
          <Clock aria-hidden className="size-3.5 shrink-0" />
          {formatElapsed(session.openedAt, now)} · {session.waiterNames.join(", ")}
        </p>
        <StatusLabel tone={status.tone} className="mt-1.5 text-xs">
          {status.label}
        </StatusLabel>
      </div>
    </button>
  );
}

function TableSheet({
  table,
  session,
  now,
  onClose,
}: {
  table: DiningTable | null;
  session: TableSession | undefined;
  now: string;
  onClose: () => void;
}) {
  const { db, ctx, slug, establishmentName } = useRestaurant();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRelease = hasPermission(ctx.role, "restaurant.table.release");

  function close() {
    setIsConfirming(false);
    setError(null);
    onClose();
  }

  async function release() {
    if (!table) return;
    try {
      await releaseTable(db, ctx, table.id);
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Sheet
      open={table !== null && session !== undefined}
      onOpenChange={(open) => !open && close()}
      title={table ? `${table.label} · ${session ? formatMoney(session.total) : ""}` : ""}
      description={
        session
          ? `Occupée depuis ${formatTime(session.openedAt)} (${formatElapsed(session.openedAt, now)}) · ${session.waiterNames.join(", ")}`
          : undefined
      }
      footer={
        table && session ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Link href={newOrderHref(slug, table.id)} className={buttonClasses("outline")}>
                <Plus aria-hidden />
                Compléter
              </Link>
              <Button variant="primary" onClick={() => window.print()}>
                <Printer aria-hidden />
                Addition
              </Button>
            </div>
            {canRelease ? (
              isConfirming ? (
                <div className="flex items-center gap-2 rounded-md bg-bg-subtle p-2">
                  <p className="flex-1 text-sm">Les clients sont partis ?</p>
                  <Button size="sm" variant="action" onClick={() => void release()}>
                    <Check aria-hidden />
                    Libérer
                  </Button>
                  <IconButton
                    label="Annuler"
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsConfirming(false)}
                  >
                    <X />
                  </IconButton>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setIsConfirming(true)}>
                  <DoorOpen aria-hidden />
                  Libérer la table
                </Button>
              )
            ) : null}
          </div>
        ) : null
      }
    >
      {table && session ? (
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <ul className="flex flex-col divide-y divide-border">
            {session.orders.map((order, index) => {
              const invoices = session.invoices.filter((invoice) => invoice.orderId === order.id);
              const total = sumMoney(
                invoices.map((invoice) => invoice.total),
                ctx.settings.currency,
              );
              const status = PREP_STATUS[orderPrepStatus(invoices.map((i) => i.prepStatus))];
              return (
                <li key={order.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
                      {index === 0 ? "Commande" : "Complément"} · {formatTime(order.createdAt)}
                    </p>
                    <p className="text-sm font-semibold tabular">{formatMoney(total)}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {summarizeLines(order, 3)}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <StatusLabel tone={status.tone} className="text-xs">
                      {status.label}
                    </StatusLabel>
                    <span className="text-xs text-text-muted">
                      {order.waiterName} · {invoices.length} facture{invoices.length > 1 ? "s" : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="flex items-center gap-2 text-sm text-text-muted">
              <Receipt aria-hidden className="size-4" />
              Total de la table
            </span>
            <span className="text-xl font-semibold tabular">{formatMoney(session.total)}</span>
          </div>
          <p className="text-xs text-text-muted">
            L&apos;encaissement arrive avec la décision D-Q03 / D-Q04 ; en attendant, la table se
            libère à la main.
          </p>
          <div className="print-area hidden print:block">
            <TableBillTicket
              session={session}
              tableLabel={table.label}
              establishmentName={establishmentName}
              printedAt={now}
            />
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function ManageTablesSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DayData;
}) {
  const { db, ctx } = useRestaurant();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = data.tables.filter((table) => table.archivedAt === null);
  const archived = data.tables.filter((table) => table.archivedAt !== null);
  const suggested = nextTableLabel(active);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = newLabel.trim() === "" ? undefined : newLabel;
    if (await run(() => addTable(db, ctx, label))) setNewLabel("");
  }

  async function onRename(table: DiningTable) {
    if (await run(() => renameTable(db, ctx, table.id, editLabel))) setEditingId(null);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setError(null);
        setEditingId(null);
        onOpenChange(next);
      }}
      title="Gérer les tables"
      description="Une table retirée du service reste dans l'historique des commandes."
    >
      <div className="flex flex-col gap-5">
        <form onSubmit={(event) => void onAdd(event)} className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium">
            Nouvelle table
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder={suggested}
              maxLength={24}
            />
          </label>
          <Button type="submit" variant="action">
            <Plus aria-hidden />
            Ajouter
          </Button>
        </form>

        {error ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <section aria-labelledby="active-tables">
          <h3 id="active-tables" className="mb-2 text-xs font-medium text-text-muted">
            En service ({active.length})
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {active.map((table) => {
              const isOccupied = data.sessions.has(table.id);
              return (
                <li key={table.id} className="flex min-h-14 items-center gap-2 py-1.5">
                  {editingId === table.id ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onRename(table);
                      }}
                    >
                      <Input
                        aria-label={`Nouveau nom de ${table.label}`}
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        maxLength={24}
                        autoFocus
                        className="flex-1"
                      />
                      <IconButton label="Enregistrer le nom" type="submit" variant="action">
                        <Check />
                      </IconButton>
                      <IconButton
                        label="Annuler"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X />
                      </IconButton>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {table.label}
                        {isOccupied ? (
                          <span className="ml-2 text-xs font-normal text-text-muted">occupée</span>
                        ) : null}
                      </span>
                      <IconButton
                        label={`Renommer ${table.label}`}
                        variant="ghost"
                        onClick={() => {
                          setEditingId(table.id);
                          setEditLabel(table.label);
                          setError(null);
                        }}
                      >
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label={
                          isOccupied
                            ? `${table.label} est occupée : libérez-la avant de la retirer`
                            : `Retirer ${table.label} du service`
                        }
                        variant="ghost"
                        disabled={isOccupied}
                        onClick={() =>
                          void run(() => setTableArchived(db, ctx, table.id, true, { isOccupied }))
                        }
                      >
                        <Archive />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {archived.length > 0 ? (
          <section aria-labelledby="archived-tables">
            <h3 id="archived-tables" className="mb-2 text-xs font-medium text-text-muted">
              Retirées du service ({archived.length})
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {archived.map((table) => (
                <li key={table.id} className="flex min-h-14 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
                    {table.label}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(() =>
                        setTableArchived(db, ctx, table.id, false, { isOccupied: false }),
                      )
                    }
                  >
                    <RotateCcw aria-hidden />
                    Remettre
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
