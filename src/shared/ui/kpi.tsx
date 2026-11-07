import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type KpiTone = "green" | "rose" | "yellow" | "peach" | "grey";

const TILE: Record<KpiTone, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  rose: "bg-kpi-rose-bg text-kpi-rose-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
  grey: "bg-kpi-grey-bg text-kpi-grey-fg",
};

/** Indicateur : tuile pastel avec icône, chiffre et libellé (§ 5.5 « KPI »). */
export function Kpi({
  icon: Icon,
  tone,
  value,
  label,
  className,
}: {
  icon: LucideIcon;
  tone: KpiTone;
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn("grid size-9 shrink-0 place-items-center rounded-md sm:size-10", TILE[tone])}
      >
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg leading-tight text-text tabular sm:text-[22px]">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}
