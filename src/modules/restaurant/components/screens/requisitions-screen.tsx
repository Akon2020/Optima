"use client";

import { ArrowRightLeft, Info, Minus, PackageMinus, PackagePlus, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { formatLongDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { Badge, type StatusTone } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Sheet } from "@/shared/ui/sheet";

import { formatQuantity } from "../../domain/menu";
import { itemsRequiringMorningStock } from "../../domain/morning-stock";
import {
  REQUISITION_KIND_LABELS,
  firstMorningEntryAt,
  requisitionKind,
} from "../../domain/requisition";
import type { MenuItem, Requisition, RequisitionKind, ServicePoint } from "../../domain/types";
import { useDayData, type DayData } from "../../offline/hooks";
import { createRequisition } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { SERVICE_POINT_ICONS, SERVICE_POINT_TONES } from "../labels";
import { useRestaurant } from "../restaurant-provider";

const TILE: Record<string, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
};

const KIND_TONES: Record<RequisitionKind, StatusTone> = {
  main: "accent",
  complement: "success",
  return: "warning",
};

/**
 * Réquisitions (EF-REQ-01, EF-REQ-02, RG-REQ-01, D-069), parcours P1 :
 * sorties du magasin vers chaque point de service, en unités de vente.
 * Avant le stock du matin d'un poste, la réquisition est « du matin » et
 * entre dans sa proposition ; après, c'est un complément, ajouté au stock de
 * la journée. Une réquisition ne se modifie plus : une erreur se corrige par
 * un retour au magasin.
 */
export function RequisitionsScreen() {
  const { ctx } = useRestaurant();
  const data = useDayData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!data) return null;

  const selected =
    data.servicePoints.find((point) => point.id === selectedId) ?? data.servicePoints[0];
  const canCreate = hasPermission(ctx.role, "restaurant.requisition.create");

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!data || !selected) return;
    const index = data.servicePoints.findIndex((point) => point.id === selected.id);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next =
      data.servicePoints[(index + delta + data.servicePoints.length) % data.servicePoints.length];
    if (next) {
      setSelectedId(next.id);
      document.getElementById(`requisition-tab-${next.id}`)?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <p className="text-sm text-text-muted first-letter:uppercase">
          Journée du {formatLongDate(data.dayStart)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Réquisitions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Sorties du magasin vers le comptoir, la cuisine et la grillade.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Points de service"
        onKeyDown={onTabsKeyDown}
        className="grid grid-cols-3 gap-2 sm:gap-4"
      >
        {data.servicePoints.map((point) => {
          const count = data.requisitions.filter(
            (requisition) => requisition.servicePointId === point.id,
          ).length;
          const isActive = point.id === selected?.id;
          const Icon = SERVICE_POINT_ICONS[point.kind];
          return (
            <button
              key={point.id}
              id={`requisition-tab-${point.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="requisition-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setSelectedId(point.id)}
              className={cn(
                "flex min-h-11 flex-col items-start gap-2 rounded-card bg-surface p-3 text-left shadow-card transition-shadow duration-150 sm:flex-row sm:items-center sm:gap-3 sm:p-4",
                isActive ? "ring-2 ring-action" : "hover:shadow-raised",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-md sm:size-10",
                  TILE[SERVICE_POINT_TONES[point.kind]],
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{point.name}</span>
                <Badge
                  tone={count > 0 ? "success" : "neutral"}
                  className="mt-1 text-[10px] sm:text-xs"
                >
                  {count === 0 ? "Aucune" : `${count} aujourd'hui`}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <PointPanel key={selected.id} data={data} point={selected} canCreate={canCreate} />
      ) : null}
    </div>
  );
}

function PointPanel({
  data,
  point,
  canCreate,
}: {
  data: DayData;
  point: ServicePoint;
  canCreate: boolean;
}) {
  const [formMode, setFormMode] = useState<"out" | "return" | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const items = itemsRequiringMorningStock(data.menuItems, point.id);
  const requisitions = data.requisitions
    .filter((requisition) => requisition.servicePointId === point.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const morningEnteredAt = firstMorningEntryAt(data.morningEntries, point.id, data.day);

  if (items.length === 0) {
    return (
      <Card id="requisition-panel" role="tabpanel">
        <EmptyState
          icon={ArrowRightLeft}
          title="Aucun élément suivi en stock à ce poste"
          description="Ajoutez des éléments avec un prix au menu de ce point de service."
        />
      </Card>
    );
  }

  return (
    <div
      id="requisition-panel"
      role="tabpanel"
      aria-labelledby={`requisition-tab-${point.id}`}
      className="flex flex-col gap-4 lg:gap-6"
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium sm:text-xl">{point.name}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {morningEnteredAt === null
                ? "Stock du matin pas encore saisi : une réquisition maintenant entre dans sa proposition."
                : `Stock du matin saisi à ${formatTime(morningEnteredAt)} : une réquisition maintenant est un complément.`}
            </p>
          </div>
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormMode("return")}>
                <PackageMinus aria-hidden />
                Retour au magasin
              </Button>
              <Button size="sm" onClick={() => setFormMode("out")}>
                <PackagePlus aria-hidden />
                Nouvelle réquisition
              </Button>
            </div>
          ) : null}
        </div>

        {saved ? (
          <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm text-text">
            {saved}
          </p>
        ) : null}
        {!canCreate ? (
          <p className="text-sm text-text-muted">Seul le gérant fait sortir du magasin.</p>
        ) : null}

        <DaySummary items={items} requisitions={requisitions} />
      </Card>

      <section aria-labelledby={`requisition-list-${point.id}`} className="flex flex-col gap-3">
        <h3 id={`requisition-list-${point.id}`} className="text-base font-medium">
          Réquisitions du jour
        </h3>
        {requisitions.length === 0 ? (
          <Card>
            <EmptyState
              icon={ArrowRightLeft}
              title="Aucune réquisition aujourd'hui"
              description="Chaque sortie du magasin vers ce poste apparaîtra ici."
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {requisitions.map((requisition) => (
              <li key={requisition.id}>
                <RequisitionCard requisition={requisition} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {formMode ? (
        <RequisitionSheet
          point={point}
          items={items}
          isReturn={formMode === "return"}
          morningEnteredAt={morningEnteredAt}
          onClose={() => setFormMode(null)}
          onSaved={(requisition) => {
            setFormMode(null);
            setSaved(
              `${requisition.number} enregistrée à ${formatTime(requisition.createdAt)} (${REQUISITION_KIND_LABELS[requisition.kind].toLowerCase()}).`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** Totaux du jour par élément : matin, compléments, retours. */
function DaySummary({
  items,
  requisitions,
}: {
  items: readonly MenuItem[];
  requisitions: readonly Requisition[];
}) {
  if (requisitions.length === 0) return null;
  const totals = new Map<string, Record<RequisitionKind, number>>();
  for (const requisition of requisitions) {
    for (const line of requisition.lines) {
      const entry = totals.get(line.menuItemId) ?? { main: 0, complement: 0, return: 0 };
      entry[requisition.kind] += line.quantity;
      totals.set(line.menuItemId, entry);
    }
  }
  const rows = items.filter((item) => totals.has(item.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">Quantités sorties du magasin aujourd&apos;hui</caption>
        <thead>
          <tr className="text-left text-xs text-text-muted">
            <th scope="col" className="pb-2 font-normal">
              Élément
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Matin
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Compléments
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Retours
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((item) => {
            const total = totals.get(item.id) ?? { main: 0, complement: 0, return: 0 };
            return (
              <tr key={item.id}>
                <th scope="row" className="py-2 text-left font-medium">
                  {item.name}
                </th>
                <td className="py-2 text-right tabular">{total.main || "·"}</td>
                <td className="py-2 text-right tabular">
                  {total.complement ? `+${total.complement}` : "·"}
                </td>
                <td className="py-2 text-right tabular">
                  {total.return ? `−${total.return}` : "·"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RequisitionCard({ requisition }: { requisition: Requisition }) {
  return (
    <Card as="article" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONES[requisition.kind]}>
            {REQUISITION_KIND_LABELS[requisition.kind]}
          </Badge>
          <span className="text-sm font-medium tabular">{requisition.number}</span>
        </div>
        <span className="text-xs text-text-muted">
          {formatTime(requisition.createdAt)}
          {requisition.createdByName ? ` · ${requisition.createdByName}` : ""}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {requisition.lines.map((line) => (
          <li key={line.menuItemId} className="rounded-full bg-bg-subtle px-3 py-1 text-sm tabular">
            {requisition.kind === "return" ? "−" : "+"}
            {formatQuantity(line.quantity, line.unit)} · {line.name}
          </li>
        ))}
      </ul>
      {requisition.comment ? (
        <p className="text-sm text-text-muted">Motif : {requisition.comment}</p>
      ) : null}
    </Card>
  );
}

function RequisitionSheet({
  point,
  items,
  isReturn,
  morningEnteredAt,
  onClose,
  onSaved,
}: {
  point: ServicePoint;
  items: readonly MenuItem[];
  isReturn: boolean;
  morningEnteredAt: string | null;
  onClose: () => void;
  onSaved: (requisition: Requisition) => void;
}) {
  const { db, ctx } = useRestaurant();
  const [quantities, setQuantities] = useState<Map<string, string>>(new Map());
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const kind = requisitionKind({
    isReturn,
    createdAt: new Date().toISOString(),
    morningEnteredAt,
  });
  const parsed = items.map((item) => {
    const text = quantities.get(item.id) ?? "";
    return { item, text, quantity: text === "" ? 0 : Number(text) };
  });
  const total = parsed.reduce((sum, line) => sum + line.quantity, 0);

  function update(itemId: string, value: string) {
    setQuantities((current) => new Map(current).set(itemId, value.replace(/[^0-9]/g, "")));
    setError(null);
  }

  async function submit() {
    setIsSaving(true);
    setError(null);
    try {
      const requisition = await createRequisition(db, ctx, {
        servicePointId: point.id,
        isReturn,
        lines: parsed
          .filter((line) => line.quantity > 0)
          .map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
        comment,
      });
      onSaved(requisition);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={isReturn ? `Retour au magasin · ${point.name}` : `Réquisition · ${point.name}`}
      description={REQUISITION_KIND_LABELS[kind]}
      footer={
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button onClick={submit} disabled={isSaving || total === 0} className="w-full">
            {isReturn ? "Valider le retour" : "Valider la réquisition"}
          </Button>
          <p className="text-center text-xs text-text-muted">
            Une réquisition validée ne se modifie plus.
          </p>
        </div>
      }
    >
      <p className="mb-4 flex items-start gap-2 rounded-md bg-bg-subtle px-3 py-2 text-xs text-text-muted">
        <Info aria-hidden className="mt-px size-4 shrink-0" />
        <span>
          {kind === "main"
            ? "Le stock du matin de ce poste n'est pas encore saisi : ces quantités s'ajouteront à sa proposition."
            : kind === "complement"
              ? "Le stock du matin de ce poste est déjà saisi : ces quantités s'ajoutent au stock de la journée et au stock attendu à la clôture."
              : "Les quantités rendues sont retirées du stock attendu à la clôture. Indiquez le motif."}
        </span>
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {parsed.map((line) => {
          const inputId = `requisition-qty-${line.item.id}`;
          return (
            <li key={line.item.id} className="flex items-center justify-between gap-3 py-2.5">
              <label htmlFor={inputId} className="min-w-0 truncate text-sm font-medium">
                {line.item.name}
              </label>
              <div className="flex items-center gap-1">
                <IconButton
                  label={`Diminuer ${line.item.name}`}
                  onClick={() => update(line.item.id, String(Math.max(0, line.quantity - 1)))}
                >
                  <Minus />
                </IconButton>
                <input
                  id={inputId}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={line.text}
                  placeholder="0"
                  onChange={(event) => update(line.item.id, event.target.value)}
                  className="h-11 w-16 rounded-sm border border-border-strong bg-surface text-center text-base font-semibold tabular placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none"
                />
                <IconButton
                  label={`Augmenter ${line.item.name}`}
                  onClick={() => update(line.item.id, String(line.quantity + 1))}
                >
                  <Plus />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      <label htmlFor="requisition-comment" className="mt-5 block text-sm font-medium">
        {isReturn ? "Motif du retour" : "Commentaire (facultatif)"}
      </label>
      <input
        id="requisition-comment"
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
          setError(null);
        }}
        maxLength={200}
        required={isReturn}
        placeholder={isReturn ? "Erreur de réquisition, surplus…" : ""}
        className="mt-2 h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none"
      />
    </Sheet>
  );
}
