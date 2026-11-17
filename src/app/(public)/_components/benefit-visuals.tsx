import { Building2, CircleCheck, CloudCheck, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * Petites illustrations des bénéfices (docs/LANDING_PAGE.md § 4 : chaque
 * visuel illustre un concept réel). Formes abstraites, sans chiffre ni nom.
 * Les barres se remplissent quand la carte apparaît au défilement (classe
 * `group` et attribut `data-revealed` posés par `RevealObserver`) ; sans
 * JavaScript ou avec `prefers-reduced-motion`, elles sont déjà pleines.
 */
const GROW =
  "origin-left transition-[scale] duration-1000 ease-out group-data-[revealed=false]:scale-x-0";

function stagger(index: number) {
  return { transitionDelay: `${200 + index * 140}ms` };
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-xl border border-border bg-surface p-3", className)}>
      {children}
    </div>
  );
}

/** Vue d'ensemble : plusieurs établissements réunis, chacun avec son état. */
function OverviewVisual() {
  const rows = [
    { width: "w-[78%]", dot: "bg-success" },
    { width: "w-[58%]", dot: "bg-success" },
    { width: "w-[36%]", dot: "bg-warning" },
  ];
  return (
    <Panel className="space-y-2.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-subtle text-brand-text">
            <Building2 className="size-3.5" />
          </span>
          <span className="h-2 flex-1 rounded-full bg-bg-subtle">
            <span
              style={stagger(index)}
              className={cn("block h-2 rounded-full bg-chart-1", GROW, row.width)}
            />
          </span>
          <span className={cn("size-2 rounded-full", row.dot)} />
        </div>
      ))}
    </Panel>
  );
}

/** Caisse défendable : attendu et déclaré comparés, l'écart justifié. */
function CashVisual() {
  return (
    <Panel className="space-y-2.5">
      {["Attendu", "Déclaré"].map((label, index) => (
        <div key={label} className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="w-12">{label}</span>
          <span className="h-2 flex-1 rounded-full bg-bg-subtle">
            <span
              style={stagger(index)}
              className={cn(
                "block h-2 rounded-full",
                GROW,
                index === 0 ? "w-[86%] bg-chart-1" : "w-[80%] bg-chart-2",
              )}
            />
          </span>
        </div>
      ))}
      <span className="flex items-center gap-2 rounded-lg bg-success-subtle px-2.5 py-1.5 text-[11px] text-text">
        <CircleCheck className="size-3.5 text-success" />
        Écart expliqué
      </span>
    </Panel>
  );
}

/** Stock fiable : stock du matin et stock compté, article par article. */
function StockVisual() {
  const items = [
    ["w-[90%]", "w-[84%]"],
    ["w-[70%]", "w-[70%]"],
    ["w-[56%]", "w-[44%]"],
  ];
  return (
    <Panel className="space-y-3">
      {items.map(([morning, counted], index) => (
        <div key={index} className="space-y-1">
          <span className="block h-1.5 rounded-full bg-bg-subtle">
            <span
              style={stagger(index)}
              className={cn("block h-1.5 rounded-full bg-chart-fill", GROW, morning)}
            />
          </span>
          <span className="block h-1.5 rounded-full bg-bg-subtle">
            <span
              style={stagger(index + 1)}
              className={cn("block h-1.5 rounded-full bg-chart-1", GROW, counted)}
            />
          </span>
        </div>
      ))}
    </Panel>
  );
}

/** Sans Internet : l'appareil garde les opérations, puis les envoie. */
function OfflineVisual() {
  return (
    <div aria-hidden className="space-y-2">
      <span className="flex items-center gap-2 rounded-xl bg-text-inverse/10 px-3 py-2 text-[11px] text-text-inverse">
        <WifiOff className="size-3.5" />
        Hors ligne, en attente
        <span className="ml-auto flex gap-1">
          {[0, 1, 2].map((index) => (
            <span key={index} className="size-1.5 rounded-full bg-text-inverse/70" />
          ))}
        </span>
      </span>
      <span className="flex items-center gap-2 rounded-xl bg-text-inverse px-3 py-2 text-[11px] font-medium text-surface-inverse">
        <CloudCheck className="size-3.5" />
        Synchronisé
      </span>
    </div>
  );
}

export const BENEFIT_VISUALS: Record<string, () => ReactNode> = {
  overview: OverviewVisual,
  cash: CashVisual,
  stock: StockVisual,
  offline: OfflineVisual,
};
