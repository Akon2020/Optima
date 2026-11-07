"use client";

import {
  ChefHat,
  CircleCheck,
  ClipboardList,
  Hourglass,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { formatMoney } from "@/shared/lib/money";
import { buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Kpi } from "@/shared/ui/kpi";
import { Tabs } from "@/shared/ui/tabs";

import { summarizeDay } from "../../domain/dashboard";
import { matchesSearch } from "../../domain/menu";
import type { PrepStatus } from "../../domain/types";
import { useDayData } from "../../offline/hooks";
import { orderPlaceLabel } from "../labels";
import { OrderDetailSheet } from "../orders/order-detail-sheet";
import { buildOrderRows } from "../orders/order-rows";
import { OrdersTable } from "../orders/orders-table";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";

type Filter = "all" | PrepStatus;

/** Commandes de la journée (EF-CMD-01 à 05, maquette « Orders list »). */
export function OrdersScreen() {
  const { slug, ctx } = useRestaurant();
  const data = useDayData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () => (data ? buildOrderRows(data.orders, data.invoices, data.servicePoints) : []),
    [data],
  );
  const summary = useMemo(
    () =>
      data
        ? summarizeDay(data.invoices, data.dayStart, data.now, ctx.settings.currency)
        : undefined,
    [data, ctx.settings.currency],
  );

  if (!data || !summary) return null;

  const counts = {
    pending: rows.filter((r) => !r.isCancelled && r.prepStatus === "pending").length,
    ready: rows.filter((r) => !r.isCancelled && r.prepStatus === "ready").length,
    served: rows.filter((r) => !r.isCancelled && r.prepStatus === "served").length,
  };
  const visible = rows.filter((row) => {
    if (filter !== "all" && (row.isCancelled || row.prepStatus !== filter)) return false;
    const haystack = [
      orderPlaceLabel(row.order.mode, row.order.tableLabel),
      row.order.waiterName,
      row.order.number,
      ...row.invoices.map((invoice) => invoice.number),
      ...row.order.lines.map((line) => line.name),
    ].join(" ");
    return matchesSearch(haystack, query);
  });
  const selected = rows.find((row) => row.order.id === selectedId) ?? null;

  function setQuery(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("q", value);
    else params.delete("q");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Commandes</h1>
          <p className="text-sm text-text-muted">
            Commandes de la journée d&apos;exploitation en cours.
          </p>
        </div>
        <Link href={restaurantHref(slug, "commandes/nouvelle")} className={buttonClasses("action")}>
          <Plus aria-hidden />
          Nouvelle commande
        </Link>
      </div>

      <Card as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi icon={Hourglass} tone="yellow" value={counts.pending} label="En préparation" />
        <Kpi icon={ChefHat} tone="peach" value={counts.ready} label="Prêtes" />
        <Kpi icon={CircleCheck} tone="green" value={counts.served} label="Servies" />
        <Kpi
          icon={TrendingUp}
          tone="grey"
          value={formatMoney(summary.billed)}
          label="Facturé aujourd'hui"
          className="col-span-2 sm:col-span-1"
        />
      </Card>

      <Card aria-labelledby="orders-list-title">
        <h2 id="orders-list-title" className="sr-only">
          Liste des commandes
        </h2>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <Tabs<Filter>
            label="Filtrer par statut"
            value={filter}
            onChange={setFilter}
            className="min-w-0 flex-1 border-b border-border"
            items={[
              { value: "all", label: "Toutes", count: rows.length },
              { value: "pending", label: "En préparation", count: counts.pending },
              { value: "ready", label: "Prêtes", count: counts.ready },
              { value: "served", label: "Servies", count: counts.served },
            ]}
          />
          <label className="flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 md:w-64">
            <Search aria-hidden className="size-4 text-text-muted" />
            <span className="sr-only">Rechercher</span>
            <input
              type="search"
              defaultValue={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Table, serveur, n°, plat…"
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-text-subtle focus:outline-none"
            />
          </label>
        </div>

        {visible.length > 0 ? (
          <OrdersTable
            rows={visible}
            now={data.now}
            onSelect={(row) => setSelectedId(row.order.id)}
            caption="Commandes de la journée"
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title={
              rows.length === 0 ? "Aucune commande aujourd'hui" : "Aucune commande ne correspond"
            }
            description={
              rows.length === 0
                ? "Les commandes validées apparaîtront ici."
                : "Modifiez la recherche ou le filtre."
            }
          />
        )}
      </Card>

      <OrderDetailSheet row={selected} onOpenChange={(open) => !open && setSelectedId(null)} />
    </div>
  );
}
