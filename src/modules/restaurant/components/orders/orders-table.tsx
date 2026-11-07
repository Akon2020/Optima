"use client";

import { ChevronRight } from "lucide-react";

import { formatElapsed, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import { cn } from "@/shared/lib/cn";
import { StatusLabel } from "@/shared/ui/badge";

import { PREP_STATUS, SERVICE_POINT_ICONS, orderPlaceLabel } from "../labels";
import { summarizeLines, type OrderRow } from "./order-rows";

function ServicePointIcons({ row }: { row: OrderRow }) {
  return (
    <span
      className="flex items-center gap-1"
      aria-label={row.servicePoints.map((p) => p.name).join(", ")}
    >
      {row.servicePoints.map((point) => {
        const Icon = SERVICE_POINT_ICONS[point.kind];
        return (
          <span
            key={point.id}
            title={point.name}
            className="grid size-6 place-items-center rounded-sm bg-bg-subtle text-text-muted"
          >
            <Icon aria-hidden className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
}

function RowStatus({ row }: { row: OrderRow }) {
  if (row.isCancelled) return <StatusLabel tone="danger">Annulée</StatusLabel>;
  const status = PREP_STATUS[row.prepStatus];
  return <StatusLabel tone={status.tone}>{status.label}</StatusLabel>;
}

/**
 * Liste des commandes (§ 5.5 « Tableau ») : sans grille, lignes de 48px, la
 * ligne survolée s'élève et sa première colonne passe en accent. En dessous
 * de 768px, chaque ligne devient une carte.
 */
export function OrdersTable({
  rows,
  now,
  onSelect,
  caption,
}: {
  rows: readonly OrderRow[];
  now: string;
  onSelect: (row: OrderRow) => void;
  caption: string;
}) {
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.order.id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-shadow duration-150 hover:shadow-raised active:bg-bg-subtle"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {orderPlaceLabel(row.order.mode, row.order.tableLabel)}
                  </p>
                  <p className="text-sm font-semibold tabular">{formatMoney(row.order.total)}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {summarizeLines(row.order)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <RowStatus row={row} />
                  <span className="text-xs text-text-muted tabular">
                    {row.order.waiterName} · {formatTime(row.order.createdAt)}
                  </span>
                </div>
              </div>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-text-subtle" />
            </button>
          </li>
        ))}
      </ul>

      <div className="-mx-2 hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-y-1 text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th scope="col" className="px-3 py-2 font-normal">
                Table
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Commande
              </th>
              <th scope="col" className="hidden px-3 py-2 font-normal 2xl:table-cell">
                N°
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Postes
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Serveur
              </th>
              <th scope="col" className="px-3 py-2 text-right font-normal">
                Montant
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Attente
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.order.id}
                tabIndex={0}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                aria-label={`Ouvrir la commande ${row.order.number}`}
                className={cn(
                  "group h-12 cursor-pointer outline-none transition-shadow duration-150",
                  "[&>td]:bg-surface [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md",
                  "hover:shadow-raised focus-visible:shadow-raised hover:[&>td]:bg-surface-raised",
                )}
              >
                <td className="px-3 font-medium whitespace-nowrap group-hover:text-accent group-focus-visible:text-accent">
                  {orderPlaceLabel(row.order.mode, row.order.tableLabel)}
                </td>
                <td className="max-w-[220px] truncate px-3">{summarizeLines(row.order)}</td>
                <td className="hidden px-3 text-text-muted tabular 2xl:table-cell">
                  {row.order.number}
                </td>
                <td className="px-3">
                  <ServicePointIcons row={row} />
                </td>
                <td className="px-3 whitespace-nowrap">{row.order.waiterName}</td>
                <td className="px-3 text-right font-medium whitespace-nowrap tabular">
                  {formatMoney(row.order.total)}
                </td>
                <td className="px-3 whitespace-nowrap text-text-muted tabular">
                  {row.prepStatus === "served"
                    ? formatTime(row.order.createdAt)
                    : formatElapsed(row.order.createdAt, now)}
                </td>
                <td className="px-3">
                  <RowStatus row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
