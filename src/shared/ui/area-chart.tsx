"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/cn";

export type AreaPoint = { label: string; value: number; valueLabel: string };

type Point = { x: number; y: number };

/** Courbe monotone (Fritsch-Carlson) : lissée sans jamais passer sous zéro. */
function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const first = points[0] as Point;
  if (n === 1) return `M${first.x},${first.y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    dx.push(b.x - a.x);
    slope.push((b.y - a.y) / (b.x - a.x || 1));
  }
  const tangent: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i += 1) {
    const s0 = slope[i - 1] ?? 0;
    const s1 = slope[i] ?? 0;
    tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2);
  }
  tangent.push(slope[n - 2] ?? 0);
  for (let i = 0; i < n - 1; i += 1) {
    const s = slope[i] ?? 0;
    if (s === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = (tangent[i] ?? 0) / s;
    const b = (tangent[i + 1] ?? 0) / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * s;
      tangent[i + 1] = t * b * s;
    }
  }
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const h = (dx[i] ?? 0) / 3;
    d += `C${a.x + h},${a.y + h * (tangent[i] ?? 0)} ${b.x - h},${b.y - h * (tangent[i + 1] ?? 0)} ${b.x},${b.y}`;
  }
  return d;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 1) ?? 10;
  return step * magnitude;
}

/**
 * Graphique d'aire à une série (docs/DESIGN_SYSTEM.md § 5.5) : courbe 2px en
 * dégradé chart-1 vers chart-2, remplissage léger, grille horizontale discrète,
 * réticule et infobulle au survol comme au clavier, tableau des données
 * consultable sans survol.
 */
export function AreaChart({
  points,
  title,
  formatAxis,
  height = 220,
  categoryHeader = "Période",
  valueHeader = "Valeur",
  className,
}: {
  points: readonly AreaPoint[];
  /** Nom de la série, utilisé par les lecteurs d'écran et le tableau. */
  title: string;
  formatAxis: (value: number) => string;
  height?: number;
  categoryHeader?: string;
  valueHeader?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const padding = { top: 12, right: 12, bottom: 28, left: 44 };
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const ticks = [0, max / 2, max];

  const coords = useMemo<Point[]>(
    () =>
      points.map((point, index) => ({
        x:
          padding.left +
          (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
        y: padding.top + innerHeight - (point.value / max) * innerHeight,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padding est constant
    [points, innerWidth, innerHeight, max],
  );

  const line = monotonePath(coords);
  const baseline = padding.top + innerHeight;
  const firstX = coords[0]?.x ?? 0;
  const lastX = coords[coords.length - 1]?.x ?? 0;
  const area = line ? `${line}L${lastX},${baseline}L${firstX},${baseline}Z` : "";
  const labelEvery = Math.max(
    1,
    Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 56))),
  );

  function nearestIndex(clientX: number): number | null {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg || coords.length === 0) return null;
    const x = clientX - svg.getBoundingClientRect().left;
    let best = 0;
    coords.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs((coords[best]?.x ?? 0) - x)) best = index;
    });
    return best;
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    if (event.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  const activePoint = active !== null ? points[active] : undefined;
  const activeCoord = active !== null ? coords[active] : undefined;

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}. Utilisez les flèches gauche et droite pour parcourir les valeurs.`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onFocus={() => setActive((i) => i ?? points.length - 1)}
            onBlur={() => setActive(null)}
            onPointerMove={(event) => setActive(nearestIndex(event.clientX))}
            onPointerLeave={() => setActive(null)}
            className="touch-pan-y overflow-visible rounded-md focus-visible:outline-2"
          >
            <defs>
              <linearGradient id={`stroke-${id}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="var(--color-chart-1)" />
                <stop offset="100%" stopColor="var(--color-chart-2)" />
              </linearGradient>
              <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-fill)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--color-chart-fill)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((tick) => {
              const y = padding.top + innerHeight - (tick / max) * innerHeight;
              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    x2={padding.left + innerWidth}
                    y1={y}
                    y2={y}
                    stroke="var(--color-chart-grid)"
                    strokeWidth={1}
                  />
                  <text
                    x={padding.left - 8}
                    y={y}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-text-muted text-[11px] tabular"
                  >
                    {formatAxis(tick)}
                  </text>
                </g>
              );
            })}

            {points.map((point, index) =>
              index % labelEvery === 0 || index === points.length - 1 ? (
                <text
                  key={point.label}
                  x={coords[index]?.x ?? 0}
                  y={height - 8}
                  textAnchor={
                    index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
                  }
                  className="fill-text-muted text-[11px] tabular"
                >
                  {point.label}
                </text>
              ) : null,
            )}

            <path d={area} fill={`url(#fill-${id})`} />
            <path
              d={line}
              fill="none"
              stroke={`url(#stroke-${id})`}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {activeCoord ? (
              <g aria-hidden>
                <line
                  x1={activeCoord.x}
                  x2={activeCoord.x}
                  y1={padding.top}
                  y2={baseline}
                  stroke="var(--color-border-strong)"
                  strokeWidth={1}
                />
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.y}
                  r={5}
                  fill="var(--color-chart-1)"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </svg>
        ) : null}

        {activePoint && activeCoord ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs whitespace-nowrap shadow-raised"
            style={{
              left: Math.min(Math.max(activeCoord.x, 70), width - 70),
              top: Math.max(0, activeCoord.y - 64),
            }}
          >
            <p className="text-sm font-semibold text-text tabular">{activePoint.valueLabel}</p>
            <p className="flex items-center gap-1.5 text-text-muted">
              <span aria-hidden className="h-0.5 w-3 rounded-full bg-chart-1" />
              {activePoint.label}
            </p>
          </div>
        ) : null}
      </div>

      <details className="mt-2 text-xs text-text-muted">
        <summary className="inline-flex min-h-8 cursor-pointer items-center hover:text-text">
          Afficher les données
        </summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">
                {categoryHeader}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.label} className="border-t border-border">
                <td className="py-1 text-text">{point.label}</td>
                <td className="py-1 text-right text-text tabular">{point.valueLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
