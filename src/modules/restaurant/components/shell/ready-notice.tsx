"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { readyForWaiter } from "../../domain/preparation";
import { useDayData } from "../../offline/hooks";
import { hasPermission } from "../../permissions";
import { orderPlaceLabel } from "../labels";
import { useRestaurant } from "../restaurant-provider";
import { restaurantHref } from "./nav-items";

/**
 * EF-PRE-02 : le serveur est averti, sur son appareil, que ses commandes sont
 * prêtes au poste de préparation. Le bandeau reste tant qu'elles ne sont pas
 * marquées servies ; une courte vibration signale chaque nouvelle commande prête.
 */
export function ReadyNotice() {
  const { ctx, slug } = useRestaurant();
  const data = useDayData();
  const ready =
    data && hasPermission(ctx.role, "restaurant.order.create")
      ? readyForWaiter(data.invoices, ctx.userId)
      : [];
  const count = ready.length;
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(200);
    }
    previous.current = count;
  }, [count]);

  if (count === 0 || !data) return null;
  const pointName = (id: string) => data.servicePoints.find((point) => point.id === id)?.name ?? "";
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1400px] px-4 pt-3 sm:px-6 lg:px-8"
    >
      <Link
        href={restaurantHref(slug, "commandes")}
        className="flex min-h-11 items-center gap-3 rounded-card bg-success-subtle px-4 py-2.5 text-sm transition-shadow duration-150 hover:shadow-raised"
      >
        <BellRing aria-hidden className="size-5 shrink-0 text-success" />
        <span className="min-w-0">
          <span className="font-semibold">
            {count} commande{count > 1 ? "s" : ""} prête{count > 1 ? "s" : ""} à servir
          </span>
          <span className="block truncate text-text-muted">
            {ready
              .map(
                (invoice) =>
                  `${orderPlaceLabel(invoice.mode, invoice.tableLabel)} (${pointName(invoice.servicePointId)})`,
              )
              .join(", ")}
          </span>
        </span>
      </Link>
    </div>
  );
}
