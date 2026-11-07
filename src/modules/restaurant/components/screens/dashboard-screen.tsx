"use client";

import {
  ArrowRight,
  ChefHat,
  CircleCheck,
  ClipboardList,
  Hourglass,
  Receipt,
  ShoppingBag,
  Sunrise,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatLongDate, localHour } from "@/shared/lib/dates";
import { formatCompactMajor, formatMoney, toMajor } from "@/shared/lib/money";
import { cn } from "@/shared/lib/cn";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { buttonClasses } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { AreaChart } from "@/shared/ui/area-chart";
import { EmptyState } from "@/shared/ui/empty-state";
import { Kpi } from "@/shared/ui/kpi";

import { summarizeDay } from "../../domain/dashboard";
import { useDayData } from "../../offline/hooks";
import { SERVICE_POINT_ICONS, SERVICE_POINT_TONES } from "../labels";
import { OrderDetailSheet } from "../orders/order-detail-sheet";
import { buildOrderRows, type OrderRow } from "../orders/order-rows";
import { OrdersTable } from "../orders/orders-table";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";

const KPI_TILE: Record<string, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
};

/** Tableau de bord du restaurant (EF-TDB-01 à 04, maquette « Dashboard »). */
export function DashboardScreen() {
  const { slug, ctx } = useRestaurant();
  const data = useDayData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currency = ctx.settings.currency;

  const summary = useMemo(
    () => (data ? summarizeDay(data.invoices, data.dayStart, data.now, currency) : undefined),
    [data, currency],
  );
  const rows = useMemo(
    () => (data ? buildOrderRows(data.orders, data.invoices, data.servicePoints) : []),
    [data],
  );

  if (!data || !summary) return null;
  const selected = rows.find((row) => row.order.id === selectedId) ?? null;

  const missingMorningStock = data.servicePoints.filter((point) => {
    const items = data.menuItems.filter(
      (i) => i.servicePointId === point.id && i.archivedAt === null && i.price !== null,
    );
    const entered = new Set(data.morningStock.map((entry) => entry.menuItemId));
    return items.length > 0 && items.some((item) => !entered.has(item.id));
  });

  const chartPoints = summary.hourly.map((point) => ({
    label: `${localHour(point.hourStart, ctx.settings.timeZone)} h`,
    value: toMajor(point.total),
    valueLabel: formatMoney(point.total),
  }));
  const waiters = [...summary.byWaiter.entries()].sort(
    (a, b) => b[1].total.amountMinor - a[1].total.amountMinor,
  );
  const openRows = rows.filter((row) => !row.isCancelled && row.prepStatus !== "served");

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted first-letter:uppercase">
            {formatLongDate(data.now)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Tableau de bord</h1>
        </div>
        <Link
          href={restaurantHref(slug, "commandes/nouvelle")}
          className={buttonClasses("action", "md", "max-sm:hidden")}
        >
          Nouvelle commande
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-4 lg:gap-6 xl:col-span-8">
          <Card aria-labelledby="sales-title">
            <CardHeader
              titleId="sales-title"
              title="Ventes de la journée"
              description="Montant des factures d'avance émises, par heure."
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_200px] md:items-center">
              {summary.invoiceCount > 0 ? (
                <AreaChart
                  points={chartPoints}
                  title="Montant facturé par heure"
                  formatAxis={formatCompactMajor}
                  categoryHeader="Heure"
                  valueHeader="Montant"
                />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="Aucune vente pour l'instant"
                  description="La courbe apparaîtra dès la première commande validée."
                />
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-1 md:gap-6">
                <Kpi
                  icon={TrendingUp}
                  tone="green"
                  value={formatMoney(summary.billed)}
                  label="Facturé aujourd'hui"
                />
                <Kpi
                  icon={Receipt}
                  tone="yellow"
                  value={summary.invoiceCount}
                  label="Factures d'avance"
                />
                <Kpi
                  icon={ShoppingBag}
                  tone="peach"
                  value={formatMoney(summary.averageOrder)}
                  label="Panier moyen"
                />
              </div>
            </div>
          </Card>

          <Card aria-labelledby="orders-title">
            <CardHeader
              titleId="orders-title"
              title="Commandes"
              action={
                <Link
                  href={restaurantHref(slug, "commandes")}
                  className={buttonClasses("outline", "sm")}
                >
                  Tout voir
                  <ArrowRight aria-hidden />
                </Link>
              }
            />
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Kpi
                icon={Hourglass}
                tone="yellow"
                value={summary.prepCounts.pending}
                label="En préparation"
              />
              <Kpi icon={ChefHat} tone="peach" value={summary.prepCounts.ready} label="Prêtes" />
              <Kpi
                icon={CircleCheck}
                tone="green"
                value={summary.prepCounts.served}
                label="Servies"
              />
            </div>
            {rows.length > 0 ? (
              <OrdersTable
                rows={(openRows.length > 0 ? openRows : rows).slice(0, 6)}
                now={data.now}
                onSelect={(row: OrderRow) => setSelectedId(row.order.id)}
                caption="Commandes en cours"
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Aucune commande aujourd'hui"
                action={
                  <Link
                    href={restaurantHref(slug, "commandes/nouvelle")}
                    className={buttonClasses("action")}
                  >
                    Prendre une commande
                  </Link>
                }
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:gap-6 xl:col-span-4">
          <Card
            tone="showcase"
            aria-labelledby="morning-title"
            className="relative overflow-hidden"
          >
            <Sunrise
              aria-hidden
              className="absolute -top-4 -right-4 size-28 text-primary opacity-25"
            />
            <h2 id="morning-title" className="relative text-xl font-medium">
              Stock du matin
            </h2>
            {missingMorningStock.length > 0 ? (
              <>
                <p className="relative mt-2 max-w-[28ch] text-sm text-text-inverse-muted">
                  À saisir pour :{" "}
                  <strong className="font-semibold text-text-inverse">
                    {missingMorningStock.map((point) => point.name).join(", ")}
                  </strong>
                  . La clôture de ce poste ne pourra pas être validée sans lui.
                </p>
                <Link
                  href={restaurantHref(slug, "stock-du-matin")}
                  className={buttonClasses("primary", "md", "relative mt-5")}
                >
                  <Sunrise aria-hidden />
                  Saisir le stock du matin
                </Link>
              </>
            ) : (
              <p className="relative mt-2 text-sm text-text-inverse-muted">
                Saisi pour tous les points de service.
              </p>
            )}
          </Card>

          <Card aria-labelledby="points-title">
            <CardHeader titleId="points-title" title="Points de service" />
            <ul className="flex flex-col gap-4">
              {data.servicePoints.map((point) => {
                const stats = summary.byServicePoint.get(point.id);
                const Icon = SERVICE_POINT_ICONS[point.kind];
                const isMissing = missingMorningStock.some((p) => p.id === point.id);
                return (
                  <li key={point.id} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-md",
                        KPI_TILE[SERVICE_POINT_TONES[point.kind]],
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{point.name}</p>
                      <p className="text-xs text-text-muted">
                        {stats?.invoices ?? 0} facture{(stats?.invoices ?? 0) > 1 ? "s" : ""}
                        {isMissing ? " · stock du matin manquant" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular">
                      {stats ? formatMoney(stats.total) : "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card aria-labelledby="waiters-title">
            <CardHeader
              titleId="waiters-title"
              title="Serveurs"
              action={
                <Badge tone="neutral" withDot={false}>
                  {waiters.length} actifs
                </Badge>
              }
            />
            {waiters.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {waiters.map(([id, waiter]) => (
                  <li key={id} className="flex items-center gap-3">
                    <Avatar
                      name={waiter.name}
                      presence={waiter.openOrders.size > 0 ? "online" : "away"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{waiter.name}</p>
                      <p className="text-xs text-text-muted">
                        {waiter.openOrders.size > 0
                          ? `${waiter.openOrders.size} commande${waiter.openOrders.size > 1 ? "s" : ""} en cours`
                          : "Aucune commande en cours"}
                      </p>
                    </div>
                    <p className="text-sm tabular">{formatMoney(waiter.total)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                Aucun serveur n&apos;a encore pris de commande.
              </p>
            )}
          </Card>
        </div>
      </div>

      <OrderDetailSheet row={selected} onOpenChange={(open) => !open && setSelectedId(null)} />
    </div>
  );
}
