"use client";

import {
  ArrowRight,
  Boxes,
  Building2,
  FileText,
  Layers,
  MapPin,
  Play,
  Receipt,
  ScanBarcode,
  Tag,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { buttonClasses } from "@/shared/ui/button";

import { DEMO, MODULE_STATUS_LABEL, MODULES } from "../_content/landing";

type ModuleKey = (typeof MODULES.items)[number]["icon"];

const ICONS: Record<ModuleKey, LucideIcon> = {
  owner: Building2,
  core: Layers,
  restaurant: UtensilsCrossed,
  shop: ScanBarcode,
};

/**
 * Modules en onglets (docs/LANDING_PAGE.md § 3, ligne 5) : motif ARIA
 * tablist (flèches, Début, Fin), un aperçu illustré par module, l'état de
 * chaque module toujours affiché (D-012) et la démo sur le Restaurant.
 */
export function ModulesTabs() {
  const baseId = useId();
  const [active, setActive] = useState<ModuleKey>("restaurant");
  const items = MODULES.items;
  const current = items.find((item) => item.icon === active) ?? items[0];

  function select(index: number) {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    setActive(item.icon);
    document.getElementById(`${baseId}-tab-${item.icon}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.icon === active);
    if (event.key === "ArrowRight") select(index + 1);
    else if (event.key === "ArrowLeft") select(index - 1);
    else if (event.key === "Home") select(0);
    else if (event.key === "End") select(items.length - 1);
    else return;
    event.preventDefault();
  }

  if (!current) return null;
  const Preview = PREVIEWS[current.icon];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Modules d'OPTIMA"
        onKeyDown={onKeyDown}
        className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {items.map((item) => {
          const isActive = item.icon === active;
          const Icon = ICONS[item.icon];
          return (
            <button
              key={item.icon}
              id={`${baseId}-tab-${item.icon}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${baseId}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(item.icon)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-200",
                isActive
                  ? "border-border-strong bg-surface font-medium text-text shadow-sm"
                  : "border-transparent text-text-muted hover:bg-surface/60 hover:text-text",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {item.title}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.icon}`}
        tabIndex={0}
        className="mt-5 rounded-[1.75rem] border border-border bg-surface p-5 shadow-card sm:p-8"
      >
        <div
          key={current.icon}
          className="grid animate-enter items-center gap-8 lg:grid-cols-[1fr_1.2fr]"
        >
          <div>
            <Badge tone={current.status === "planned" ? "neutral" : "accent"}>
              {MODULE_STATUS_LABEL[current.status]}
            </Badge>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">{current.title}</h3>
            <p className="mt-3 text-text-muted">{current.text}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {current.features.map((feature) => (
                <li
                  key={feature}
                  className="rounded-full border border-border bg-bg-subtle px-3 py-1.5 text-sm"
                >
                  {feature}
                </li>
              ))}
            </ul>
            {"hasDemo" in current ? (
              <div className="mt-6">
                <Link href={DEMO.href} className={buttonClasses("action", "md", "rounded-full!")}>
                  <Play aria-hidden />
                  {DEMO.label}
                  <ArrowRight aria-hidden />
                </Link>
                <p className="mt-2 max-w-sm text-xs text-text-muted">{DEMO.note}</p>
              </div>
            ) : null}
          </div>
          <div aria-hidden className="rounded-2xl bg-bg-subtle p-4 sm:p-6">
            <Preview />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-3 shadow-sm", className)}>
      {children}
    </div>
  );
}

function delay(ms: number) {
  return { animationDelay: `${ms}ms` };
}

/** Propriétaire : plusieurs établissements, une seule vue. */
function OwnerPreview() {
  return (
    <div className="space-y-3">
      <Tile className="flex items-center justify-between">
        <span className="text-xs font-medium">Tous les établissements</span>
        <span className="h-5 w-16 rounded-full border border-border" />
      </Tile>
      <div className="grid grid-cols-3 gap-3">
        {["bg-success", "bg-success", "bg-warning"].map((dot, index) => (
          <Tile key={index} className="animate-enter space-y-2">
            <span className="flex items-center justify-between">
              <Building2 className="size-4 text-brand-text" />
              <span className={cn("size-2 rounded-full", dot)} />
            </span>
            <span className="block h-2 w-3/4 rounded-full bg-border-strong" />
            <span className="block h-1.5 w-1/2 rounded-full bg-border" />
          </Tile>
        ))}
      </div>
      <Tile className="flex h-24 items-end gap-2">
        {[40, 62, 50, 78, 58, 88, 70].map((height, index) => (
          <span
            key={index}
            style={{ height: `${height}%`, ...delay(index * 70) }}
            className="flex-1 origin-bottom animate-enter rounded-t-md bg-chart-fill last:bg-chart-1"
          />
        ))}
      </Tile>
    </div>
  );
}

/** Socle commerce : les briques communes. */
function CorePreview() {
  const blocks: { label: string; Icon: LucideIcon }[] = [
    { label: "Catalogue et prix", Icon: Tag },
    { label: "Stock et achats", Icon: Boxes },
    { label: "Caisse", Icon: Wallet },
    { label: "Documents", Icon: FileText },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {blocks.map(({ label, Icon }, index) => (
        <Tile key={label} className="animate-enter space-y-3">
          <span
            style={delay(index * 90)}
            className="grid size-9 place-items-center rounded-lg bg-primary-subtle text-brand-text"
          >
            <Icon className="size-4" />
          </span>
          <span className="block text-xs font-medium">{label}</span>
          <span className="block h-1.5 w-2/3 rounded-full bg-border" />
        </Tile>
      ))}
    </div>
  );
}

/** Restaurant : une commande, une facture d'avance par point de service. */
function RestaurantPreview() {
  const points = ["Comptoir", "Cuisine", "Grillade"];
  return (
    <div className="space-y-3">
      <Tile className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary-subtle text-brand-text">
          <Receipt className="size-4" />
        </span>
        <span className="flex-1 space-y-1.5">
          <span className="block text-xs font-medium">Commande en salle</span>
          <span className="block h-1.5 w-1/2 rounded-full bg-border" />
        </span>
        <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px]">Validée</span>
      </Tile>
      <div className="mx-auto h-5 w-px bg-border-strong" />
      <div className="grid grid-cols-3 gap-2.5">
        {points.map((point, index) => (
          <Tile key={point} className="space-y-2">
            <span
              style={delay(150 + index * 160)}
              className="block animate-enter text-[11px] font-medium"
            >
              {point}
            </span>
            <span className="block h-1.5 w-full rounded-full bg-border" />
            <span className="block h-1.5 w-2/3 rounded-full bg-border" />
            <span
              style={delay(300 + index * 160)}
              className="block h-1.5 w-1/3 animate-enter rounded-full bg-chart-1"
            />
          </Tile>
        ))}
      </div>
    </div>
  );
}

/** Boutique (prévue) : articles suivis un par un, expédiés vers d'autres villes. */
function ShopPreview() {
  return (
    <div className="space-y-3 opacity-80">
      {[0, 1].map((index) => (
        <Tile key={index} className="flex items-center gap-3">
          <ScanBarcode className="size-4 text-brand-text" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-2 w-1/2 rounded-full bg-border-strong" />
            <span className="block h-1.5 w-1/3 rounded-full bg-border" />
          </span>
          <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[11px] text-text-muted">
            N° de série
          </span>
        </Tile>
      ))}
      <Tile className="flex items-center gap-3">
        <MapPin className="size-4 text-brand-text" />
        <span className="h-px flex-1 border-t border-dashed border-border-strong" />
        <MapPin className="size-4 text-text-muted" />
      </Tile>
    </div>
  );
}

const PREVIEWS: Record<ModuleKey, () => ReactNode> = {
  owner: OwnerPreview,
  core: CorePreview,
  restaurant: RestaurantPreview,
  shop: ShopPreview,
};
