"use client";

import {
  Beer,
  Check,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/cn";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, multiplyMoney, sumMoney, type Money } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton, buttonClasses } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Sheet } from "@/shared/ui/sheet";
import { Tabs } from "@/shared/ui/tabs";

import {
  isOrderable,
  itemsForMenu,
  matchesSearch,
  maxOrderableQuantity,
  sortByPopularity,
} from "../../domain/menu";
import { CART_ISSUE_MESSAGES, validateCart } from "../../domain/order";
import type {
  AdvanceInvoice,
  MenuItem,
  MenuKind,
  OrderMode,
  ServicePoint,
} from "../../domain/types";
import { useDayData, type DayData } from "../../offline/hooks";
import { createOrder } from "../../offline/repository";
import { availabilityBadge, categoryVisual } from "../labels";
import { AdvanceInvoiceTicket } from "../orders/advance-invoice-ticket";
import { buildOrderRows } from "../orders/order-rows";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";

type Cart = Map<string, number>;

const TILE: Record<string, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  rose: "bg-kpi-rose-bg text-kpi-rose-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
  grey: "bg-kpi-grey-bg text-kpi-grey-fg",
};

/**
 * Prise de commande (EF-CMD-01, EF-CMD-02, P2) : table ou vente à emporter,
 * éléments des deux menus (les plus vendus d'abord), panier réparti par point
 * de service, validation qui produit une facture d'avance par poste.
 */
export function NewOrderScreen() {
  const { db, ctx, slug, establishmentName } = useRestaurant();
  const data = useDayData();
  const [mode, setMode] = useState<OrderMode>("dine-in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuKind>("drinks");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Cart>(new Map());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdvanceInvoice[] | null>(null);

  const busyTables = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      buildOrderRows(data.orders, data.invoices, data.servicePoints)
        .filter((row) => !row.isCancelled && row.prepStatus !== "served" && row.order.tableId)
        .map((row) => row.order.tableId as string),
    );
  }, [data]);

  if (!data) return null;

  const itemById = new Map(data.menuItems.map((item) => [item.id, item]));
  const cartLines = [...cart.entries()]
    .map(([id, quantity]) => ({ item: itemById.get(id), quantity }))
    .filter((line): line is { item: MenuItem; quantity: number } => line.item !== undefined);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = sumMoney(
    cartLines.map((line) =>
      line.item.price
        ? multiplyMoney(line.item.price, line.quantity)
        : zeroOf(ctx.settings.currency),
    ),
    ctx.settings.currency,
  );

  function setQuantity(item: MenuItem, quantity: number) {
    const availability = data?.availability.get(item.id);
    const max = availability ? maxOrderableQuantity(availability) : null;
    const next = Math.max(0, max === null ? quantity : Math.min(quantity, max));
    setCart((current) => {
      const copy = new Map(current);
      if (next === 0) copy.delete(item.id);
      else copy.set(item.id, next);
      return copy;
    });
    setError(null);
  }

  async function submit() {
    const issues = validateCart({
      lines: cartLines.map((line) => ({ name: line.item.name, quantity: line.quantity })),
      mode,
      tableId: mode === "dine-in" ? tableId : null,
    });
    const firstIssue = issues[0];
    if (firstIssue) {
      setError(CART_ISSUE_MESSAGES[firstIssue.code]);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createOrder(db, ctx, {
        mode,
        tableId: mode === "dine-in" ? tableId : null,
        lines: cartLines.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
      });
      setCreated(result.invoices);
      setIsCartOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startOver() {
    setCart(new Map());
    setCreated(null);
    setTableId(null);
    setMode("dine-in");
    setQuery("");
  }

  const visibleItems = sortByPopularity(
    itemsForMenu(data.menuItems, data.servicePoints, menu).filter((item) =>
      matchesSearch(`${item.name} ${item.category}`, query),
    ),
    data.soldByItem,
  );
  const countByMenu = (kind: MenuKind) =>
    cartLines
      .filter(
        (line) => data.servicePoints.find((p) => p.id === line.item.servicePointId)?.menu === kind,
      )
      .reduce((sum, line) => sum + line.quantity, 0);

  const cartPanel = (
    <CartPanel
      data={data}
      lines={cartLines}
      total={cartTotal}
      mode={mode}
      tableLabel={data.tables.find((t) => t.id === tableId)?.label ?? null}
      error={error}
      isSubmitting={isSubmitting}
      onQuantity={setQuantity}
      onSubmit={() => void submit()}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            Nouvelle commande
          </h1>
          <p className="text-sm text-text-muted">Serveur : {ctx.userName}</p>
        </div>

        <section aria-labelledby="place-title" className="rounded-card bg-surface p-4 shadow-card">
          <h2 id="place-title" className="sr-only">
            Table ou type de vente
          </h2>
          <div
            role="radiogroup"
            aria-label="Type de vente"
            className="grid grid-cols-3 gap-1 rounded-md bg-bg-subtle p-1"
          >
            {(
              [
                { value: "dine-in", label: "Sur place" },
                { value: "takeaway", label: "À emporter" },
                { value: "delivery", label: "Livraison" },
              ] as const
            ).map((option) => {
              const isDisabled = option.value === "delivery";
              const isChecked = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isChecked}
                  disabled={isDisabled}
                  title={
                    isDisabled ? "La livraison arrive avec le module Livraison (D-Q07)." : undefined
                  }
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center rounded-sm text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:text-text-subtle",
                    isChecked
                      ? "bg-surface text-text shadow-sm"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {option.label}
                  {isDisabled ? <span className="text-[10px] leading-none">Bientôt</span> : null}
                </button>
              );
            })}
          </div>

          {mode === "dine-in" ? (
            <div className="mt-4">
              <p id="table-label" className="mb-2 text-xs font-medium">
                Table{" "}
                {tableId ? null : <span className="font-normal text-text-muted">· à choisir</span>}
              </p>
              <div
                role="radiogroup"
                aria-labelledby="table-label"
                className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0 xl:grid-cols-12"
              >
                {data.tables.map((table) => {
                  const isChecked = table.id === tableId;
                  const isBusy = busyTables.has(table.id);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      role="radio"
                      aria-checked={isChecked}
                      aria-label={`${table.label}${isBusy ? ", commande en cours" : ""}`}
                      onClick={() => setTableId(table.id)}
                      className={cn(
                        "relative flex h-11 min-w-12 shrink-0 items-center justify-center rounded-md border text-sm font-semibold tabular transition-colors duration-150",
                        isChecked
                          ? "border-action bg-action text-on-action"
                          : "border-border-strong bg-surface hover:bg-bg-subtle",
                      )}
                    >
                      {table.label.replace(/^Table\s+/i, "")}
                      {isBusy ? (
                        <span
                          aria-hidden
                          className="absolute top-1 right-1 size-1.5 rounded-full bg-accent"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                Commande en cours : la nouvelle facture sera complémentaire (EF-CMD-04).
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="menu-title" className="flex flex-col gap-3">
          <h2 id="menu-title" className="sr-only">
            Menus
          </h2>
          <div className="flex flex-col gap-3 rounded-card bg-surface px-4 pt-1 shadow-card sm:flex-row sm:items-center">
            <Tabs<MenuKind>
              label="Menu"
              value={menu}
              onChange={setMenu}
              className="min-w-0 flex-1"
              items={[
                {
                  value: "drinks",
                  label: "Boissons",
                  icon: Beer,
                  ...(countByMenu("drinks") ? { count: countByMenu("drinks") } : {}),
                },
                {
                  value: "food",
                  label: "Nourriture",
                  icon: UtensilsCrossed,
                  ...(countByMenu("food") ? { count: countByMenu("food") } : {}),
                },
              ]}
            />
            <label className="mb-3 flex h-11 items-center gap-2 border-b border-border-strong sm:mb-0 sm:w-56">
              <Search aria-hidden className="size-4 text-text-muted" />
              <span className="sr-only">Rechercher dans le menu</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher…"
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-text-subtle focus:outline-none"
              />
            </label>
          </div>

          {visibleItems.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-4">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <MenuItemTile
                    item={item}
                    data={data}
                    quantity={cart.get(item.id) ?? 0}
                    onQuantity={(quantity) => setQuantity(item, quantity)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Search}
              title="Aucun élément trouvé"
              description="Modifiez la recherche."
            />
          )}
        </section>
      </div>

      <aside aria-label="Commande en cours" className="hidden lg:block">
        <div className="sticky top-24">{cartPanel}</div>
      </aside>

      {/* Mobile : barre de panier fixée en bas, panneau plein écran. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="flex h-14 w-full items-center gap-3 rounded-md bg-action px-4 text-on-action"
        >
          <span className="relative">
            <ShoppingBag aria-hidden className="size-5" />
            {cartCount > 0 ? (
              <span className="absolute -top-2 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary tabular">
                {cartCount}
              </span>
            ) : null}
          </span>
          <span className="flex-1 text-left text-sm font-medium">
            {cartCount === 0 ? "Commande vide" : "Voir la commande"}
          </span>
          <span className="text-sm font-semibold tabular">{formatMoney(cartTotal)}</span>
        </button>
      </div>

      <Sheet
        open={isCartOpen}
        onOpenChange={setIsCartOpen}
        title="Commande en cours"
        className="lg:hidden"
      >
        {cartPanel}
      </Sheet>

      <Sheet
        open={created !== null}
        onOpenChange={(open) => !open && startOver()}
        title="Commande enregistrée"
        description={
          created
            ? `${created.length} facture${created.length > 1 ? "s" : ""} d'avance à déposer aux points de service.`
            : undefined
        }
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={() => window.print()}>
              <Printer aria-hidden />
              Imprimer les factures d&apos;avance
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="action" onClick={startOver}>
                <Plus aria-hidden />
                Nouvelle
              </Button>
              <Link href={restaurantHref(slug, "commandes")} className={buttonClasses("outline")}>
                Commandes
              </Link>
            </div>
          </div>
        }
      >
        <div className="print-area flex flex-col gap-4">
          {created?.map((invoice) => (
            <AdvanceInvoiceTicket
              key={invoice.id}
              invoice={invoice}
              establishmentName={establishmentName}
              servicePointName={
                data.servicePoints.find((p) => p.id === invoice.servicePointId)?.name ?? ""
              }
            />
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function zeroOf(currency: Money["currency"]): Money {
  return { amountMinor: 0, currency };
}

function MenuItemTile({
  item,
  data,
  quantity,
  onQuantity,
}: {
  item: MenuItem;
  data: DayData;
  quantity: number;
  onQuantity: (quantity: number) => void;
}) {
  const availability = data.availability.get(item.id);
  const canOrder = availability ? isOrderable(availability) : false;
  const max = availability ? maxOrderableQuantity(availability) : null;
  const badge = availabilityBadge(availability);
  const visual = categoryVisual(item.category);
  const Icon = visual.icon;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-card bg-surface p-3 shadow-card transition-shadow duration-150 sm:p-4",
        quantity > 0 && "ring-2 ring-accent",
        !canOrder && "opacity-60",
      )}
    >
      <button
        type="button"
        disabled={!canOrder || (max !== null && quantity >= max)}
        onClick={() => onQuantity(quantity + 1)}
        aria-label={`Ajouter ${item.name}`}
        className="absolute inset-0 rounded-card disabled:cursor-not-allowed"
      />
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <span
          aria-hidden
          className={cn("grid size-10 place-items-center rounded-md sm:size-12", TILE[visual.tone])}
        >
          <Icon className="size-5 sm:size-6" />
        </span>
        {badge && badge.tone !== "success" ? (
          <Badge tone={badge.tone} className="text-[10px]">
            {badge.label}
          </Badge>
        ) : null}
      </div>
      <p className="pointer-events-none mt-3 line-clamp-2 text-sm leading-snug font-semibold sm:text-[15px]">
        {item.name}
      </p>
      <p className="pointer-events-none mt-0.5 text-xs text-text-muted">{item.category}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <p className="pointer-events-none text-sm font-semibold tabular sm:text-base">
          {item.price ? formatMoney(item.price) : "À fixer"}
        </p>
        {quantity > 0 ? (
          <div className="relative z-10 flex items-center gap-1">
            <IconButton
              label={`Retirer un ${item.name}`}
              size="sm"
              onClick={() => onQuantity(quantity - 1)}
            >
              <Minus />
            </IconButton>
            <span className="w-6 text-center text-sm font-semibold tabular" aria-live="polite">
              {quantity}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CartPanel({
  data,
  lines,
  total,
  mode,
  tableLabel,
  error,
  isSubmitting,
  onQuantity,
  onSubmit,
}: {
  data: DayData;
  lines: { item: MenuItem; quantity: number }[];
  total: Money;
  mode: OrderMode;
  tableLabel: string | null;
  error: string | null;
  isSubmitting: boolean;
  onQuantity: (item: MenuItem, quantity: number) => void;
  onSubmit: () => void;
}) {
  const groups = data.servicePoints
    .map((point: ServicePoint) => ({
      point,
      lines: lines.filter((line) => line.item.servicePointId === point.id),
    }))
    .filter((group) => group.lines.length > 0);

  return (
    <div className="flex flex-col gap-4 lg:rounded-card lg:bg-surface lg:p-5 lg:shadow-card">
      <div className="hidden items-baseline justify-between lg:flex">
        <h2 className="text-lg font-medium">Commande</h2>
        <p className="text-sm text-text-muted">
          {mode === "dine-in" ? (tableLabel ?? "Table à choisir") : "À emporter"}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Commande vide"
          description="Touchez un élément du menu pour l'ajouter."
          className="py-8"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group, index) => (
            <section key={group.point.id} aria-label={group.point.name}>
              <p className="mb-2 flex items-center justify-between text-xs font-medium text-text-muted">
                <span>{group.point.name}</span>
                <span>
                  Facture {index + 1}/{groups.length}
                </span>
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {group.lines.map(({ item, quantity }) => (
                  <li key={item.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-text-muted tabular">
                        {item.price ? formatMoney(multiplyMoney(item.price, quantity)) : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={
                          quantity === 1 ? `Supprimer ${item.name}` : `Retirer un ${item.name}`
                        }
                        size="sm"
                        variant="ghost"
                        onClick={() => onQuantity(item, quantity - 1)}
                      >
                        {quantity === 1 ? <Trash2 /> : <Minus />}
                      </IconButton>
                      <span className="w-6 text-center text-sm font-semibold tabular">
                        {quantity}
                      </span>
                      <IconButton
                        label={`Ajouter un ${item.name}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => onQuantity(item, quantity + 1)}
                      >
                        <Plus />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm text-text-muted">Total</span>
        <span className="text-xl font-semibold tabular">{formatMoney(total)}</span>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <Button
        variant="action"
        size="lg"
        className="w-full"
        disabled={groups.length === 0 || isSubmitting}
        onClick={onSubmit}
      >
        <Check aria-hidden />
        {isSubmitting
          ? "Enregistrement…"
          : groups.length > 1
            ? `Valider · ${groups.length} factures d'avance`
            : "Valider la commande"}
      </Button>
    </div>
  );
}
