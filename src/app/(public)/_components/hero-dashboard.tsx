import {
  BarChart3,
  Boxes,
  CircleCheck,
  CloudCheck,
  LayoutDashboard,
  Receipt,
  Search,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";

/**
 * Aperçu stylisé du tableau de bord (docs/LANDING_PAGE.md § 3, ligne 2 ;
 * § 2) : formes abstraites construites avec les tokens, sans aucun chiffre
 * ni nom. Les valeurs sont des barres neutres. Animations en CSS seul
 * (entrée, tracé de la courbe, barres, cartes flottantes), donc visibles
 * sans JavaScript et ramenées à 1 ms par `prefers-reduced-motion`.
 * Décoratif : masqué des lecteurs d'écran.
 */
const NAV: { label: string; Icon: LucideIcon }[] = [
  { label: "Vue d'ensemble", Icon: LayoutDashboard },
  { label: "Commandes", Icon: Receipt },
  { label: "Caisse", Icon: Wallet },
  { label: "Stock", Icon: Boxes },
  { label: "Restaurant", Icon: UtensilsCrossed },
  { label: "Rapports", Icon: BarChart3 },
];

const KPIS = [
  { label: "Ventes du jour", width: "w-20" },
  { label: "Caisse", width: "w-16" },
  { label: "Stock du matin", width: "w-14" },
  { label: "Écarts", width: "w-10" },
];

const SERVICE_POINTS = [
  { label: "Comptoir", width: "w-[82%]" },
  { label: "Cuisine", width: "w-[64%]" },
  { label: "Grillade", width: "w-[48%]" },
];

/** Forme de la courbe (valeurs relatives entre 0 et 1, sans unité). */
const CURVE = [
  0.42, 0.38, 0.46, 0.4, 0.52, 0.48, 0.44, 0.56, 0.5, 0.6, 0.55, 0.66, 0.58, 0.63, 0.72, 0.64, 0.7,
  0.78, 0.71, 0.8, 0.76, 0.86, 0.82, 0.92,
];
const CHART_W = 600;
const CHART_H = 180;
const HIGHLIGHT = 14;

function point(index: number): [number, number] {
  const value = CURVE[index] ?? 0;
  return [(index / (CURVE.length - 1)) * CHART_W, CHART_H - value * CHART_H * 0.9];
}

const LINE = CURVE.map((_, index) => {
  const [x, y] = point(index);
  return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ");
const AREA = `${LINE} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;
const [HIGHLIGHT_X, HIGHLIGHT_Y] = point(HIGHLIGHT);

function delay(ms: number) {
  return { animationDelay: `${ms}ms` };
}

export function HeroDashboard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative mx-auto w-full max-w-5xl [perspective:2400px]", className)}
    >
      <div
        style={delay(450)}
        className="origin-top animate-enter rounded-[1.75rem] border border-border bg-surface/70 p-2 shadow-raised backdrop-blur-md lg:[transform:rotateX(10deg)]"
      >
        <div className="flex overflow-hidden rounded-[1.25rem] border border-border bg-bg text-left">
          <div className="hidden w-48 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
            <span className="mb-4 text-sm font-bold tracking-[0.2em] text-brand-text">OPTIMA</span>
            {NAV.map(({ label, Icon }, index) => (
              <span
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs",
                  index === 0 ? "bg-primary-subtle font-medium text-text" : "text-text-muted",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-8 w-full max-w-56 items-center gap-2 rounded-full border border-border bg-surface px-3">
                <Search className="size-3.5 text-text-subtle" />
                <span className="h-1.5 w-24 rounded-full bg-border" />
              </span>
              <span className="flex items-center gap-2">
                <span className="size-7 rounded-full border border-border bg-surface" />
                <span className="size-7 rounded-full bg-primary-subtle" />
              </span>
            </div>

            <p className="mt-5 text-sm font-semibold text-text sm:text-base">Vue d&apos;ensemble</p>
            <span className="mt-1.5 block h-1.5 w-40 rounded-full bg-border" />

            <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {KPIS.map((kpi, index) => (
                <div
                  key={kpi.label}
                  style={delay(700 + index * 90)}
                  className="animate-enter rounded-xl border border-border bg-surface p-3"
                >
                  <p className="truncate text-[11px] text-text-muted">{kpi.label}</p>
                  <span className={cn("mt-2 block h-3.5 rounded bg-text/80", kpi.width)} />
                  <span className="mt-2 flex items-center gap-1.5">
                    <TrendingUp className="size-3 text-success" />
                    <span className="h-1.5 w-10 rounded-full bg-success-subtle" />
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-3 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-text">Ventes</p>
                  <span className="h-5 w-14 rounded-full border border-border" />
                </div>
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="none"
                  className="mt-3 h-28 w-full overflow-visible sm:h-36"
                >
                  <defs>
                    <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((ratio) => (
                    <line
                      key={ratio}
                      x1="0"
                      x2={CHART_W}
                      y1={CHART_H * ratio}
                      y2={CHART_H * ratio}
                      stroke="var(--color-chart-grid)"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <path
                    d={AREA}
                    fill="url(#hero-area)"
                    style={delay(1300)}
                    className="animate-enter"
                  />
                  <path
                    d={LINE}
                    fill="none"
                    stroke="var(--color-chart-1)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray="1"
                    vectorEffect="non-scaling-stroke"
                    style={delay(800)}
                    className="animate-draw"
                  />
                  <line
                    x1={HIGHLIGHT_X}
                    x2={HIGHLIGHT_X}
                    y1={HIGHLIGHT_Y}
                    y2={CHART_H}
                    stroke="var(--color-chart-1)"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                    style={delay(2200)}
                    className="animate-enter"
                  />
                </svg>
                {/* Point mis en avant : posé en HTML pour rester rond malgré l'étirement du SVG. */}
                <div className="relative -mt-28 h-28 sm:-mt-36 sm:h-36">
                  <span
                    style={{
                      left: `${(HIGHLIGHT_X / CHART_W) * 100}%`,
                      top: `${(HIGHLIGHT_Y / CHART_H) * 100}%`,
                      ...delay(2200),
                    }}
                    className="absolute grid size-3 -translate-1/2 animate-enter place-items-center"
                  >
                    <span className="absolute size-3 animate-halo rounded-full bg-chart-1" />
                    <span className="size-3 rounded-full border-2 border-surface bg-chart-1" />
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-medium text-text">Points de service</p>
                <ul className="mt-3 space-y-3">
                  {SERVICE_POINTS.map((servicePoint, index) => (
                    <li key={servicePoint.label}>
                      <span className="flex items-center justify-between text-[11px] text-text-muted">
                        {servicePoint.label}
                        <span className="h-1.5 w-8 rounded-full bg-border" />
                      </span>
                      <span className="mt-1.5 block h-2 rounded-full bg-bg-subtle">
                        <span
                          style={delay(1000 + index * 150)}
                          className={cn(
                            "block h-2 origin-left animate-grow rounded-full bg-chart-2",
                            servicePoint.width,
                          )}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="mt-4 flex items-center gap-2 rounded-lg bg-success-subtle px-2.5 py-2 text-[11px] text-text">
                  <CircleCheck className="size-3.5 text-success" />
                  Journée validée
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={delay(1600)}
        className="absolute top-16 right-5 hidden animate-enter sm:block lg:right-8"
      >
        <span className="flex animate-float items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm shadow-raised">
          <CloudCheck className="size-4 text-success" />
          Synchronisé
        </span>
      </div>
      <div
        style={delay(1900)}
        className="absolute bottom-20 left-5 hidden animate-enter sm:block lg:left-8"
      >
        <div
          style={{ animationDelay: "-3.5s" }}
          className="flex w-52 animate-float flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5 shadow-raised"
        >
          <span className="flex items-center gap-2 text-xs text-text-muted">
            <Receipt className="size-3.5" />
            Facture d&apos;avance
          </span>
          <span className="flex items-center justify-between text-sm font-medium text-text">
            Cuisine
            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] text-text">
              Envoyée
            </span>
          </span>
          <span className="h-1.5 w-28 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}
