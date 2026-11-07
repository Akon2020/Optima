"use client";

import { formatCompactMajor, formatMoney, toMajor, type Money } from "@/shared/lib/money";
import { AreaChart } from "@/shared/ui/area-chart";

/** Évolution des ventes de la période (EF-PRO-02), pour une devise. */
export function OverviewChart({
  points,
  title,
  categoryHeader,
}: {
  points: { label: string; value: Money }[];
  title: string;
  categoryHeader: string;
}) {
  return (
    <AreaChart
      title={title}
      categoryHeader={categoryHeader}
      valueHeader="Montant facturé"
      formatAxis={formatCompactMajor}
      points={points.map((point) => ({
        label: point.label,
        value: toMajor(point.value),
        valueLabel: formatMoney(point.value),
      }))}
    />
  );
}
