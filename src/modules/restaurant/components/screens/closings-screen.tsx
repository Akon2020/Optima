"use client";

import { CalendarRange, ClipboardCheck, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatLongDate } from "@/shared/lib/dates";
import { Tabs, type TabItem } from "@/shared/ui/tabs";

import { useClosingData, useDayData } from "../../offline/hooks";
import { hasPermission } from "../../permissions";
import { CashClosingPanel } from "../closings/cash-closing-panel";
import { DayClosingPanel } from "../closings/day-closing-panel";
import { StockCountPanel } from "../closings/stock-count-panel";
import { useRestaurant } from "../restaurant-provider";

type Section = "cash" | "stock" | "day";

/**
 * Clôture de service (EF-CLO-01 à 04, D-039, D-056) : chacun déclare sa
 * caisse, le gérant compte le stock de chaque point de service puis valide
 * la journée. Une journée validée ne se modifie plus (RG-CLO-02).
 */
export function ClosingsScreen() {
  const { ctx, slug, isDemo } = useRestaurant();
  const data = useDayData();
  const closing = useClosingData();
  const canDeclare = hasPermission(ctx.role, "restaurant.closing.declare");
  const items: TabItem<Section>[] = [
    ...(canDeclare ? [{ value: "cash" as const, label: "Ma caisse", icon: Wallet }] : []),
    { value: "stock", label: "Stock", icon: ClipboardCheck },
    { value: "day", label: "Journée", icon: ShieldCheck },
  ];
  const [section, setSection] = useState<Section>(canDeclare ? "cash" : "day");
  const active = items.some((item) => item.value === section) ? section : "day";

  if (!data || !closing) return null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <p className="text-sm text-text-muted first-letter:uppercase">
          Journée du {formatLongDate(`${closing.status.day}T12:00:00.000Z`)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Clôtures</h1>
        {/* D-064 : périodes et corrections se font en ligne, avec la session web du gérant. */}
        {!isDemo && hasPermission(ctx.role, "restaurant.closing.validate") ? (
          <Link
            href={`/e/${slug}/clotures`}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-link underline-offset-2 hover:underline"
          >
            <CalendarRange aria-hidden className="size-4" />
            Périodes et corrections (en ligne)
          </Link>
        ) : null}
      </div>
      <Tabs<Section>
        label="Étapes de la clôture"
        value={active}
        onChange={setSection}
        items={items}
        className="border-b border-border"
      />
      {active === "cash" ? <CashClosingPanel data={data} closing={closing} /> : null}
      {active === "stock" ? <StockCountPanel data={data} closing={closing} /> : null}
      {active === "day" ? <DayClosingPanel data={data} closing={closing} /> : null}
    </div>
  );
}
