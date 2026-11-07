"use client";

import { Check, History, Info, Minus, Pencil, Plus, RotateCcw, Sunrise } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { formatLongDate, formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";

import { SALE_UNIT_LABELS, formatQuantity } from "../../domain/menu";
import {
  DEFAULT_MORNING_REASONS,
  isMorningStockComplete,
  itemsRequiringMorningStock,
  morningVariance,
  requiresReason,
  validateMorningLines,
  type MorningLineIssue,
} from "../../domain/morning-stock";
import type { MenuItem, MorningStockEntry, ServicePoint } from "../../domain/types";
import { useDayData, useMorningProposals, type DayData } from "../../offline/hooks";
import { saveMorningStock } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { SERVICE_POINT_ICONS, SERVICE_POINT_TONES } from "../labels";
import { useRestaurant } from "../restaurant-provider";

const TILE: Record<string, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
};

type Draft = Map<string, { quantity?: string; reason?: string }>;

type PointStatus = {
  required: MenuItem[];
  entered: number;
  isComplete: boolean;
  lastEntry: MorningStockEntry | undefined;
};

function pointStatus(data: DayData, point: ServicePoint): PointStatus {
  const required = itemsRequiringMorningStock(data.menuItems, point.id);
  const entries = required
    .map((item) => data.morningStock.get(item.id))
    .filter((entry): entry is MorningStockEntry => entry !== undefined);
  return {
    required,
    entered: entries.length,
    isComplete: isMorningStockComplete(data.menuItems, point.id, data.morningStock),
    lastEntry: entries.sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))[0],
  };
}

function unitLabel(items: readonly MenuItem[]): string {
  const unit = items[0]?.unit;
  return unit ? `en ${SALE_UNIT_LABELS[unit].many}` : "";
}

/** Stock du matin (EF-REQ-03, EF-REQ-04, RG-REQ-02, RG-REQ-03), parcours P1. */
export function MorningStockScreen() {
  const { ctx } = useRestaurant();
  const data = useDayData();
  const proposals = useMorningProposals(data?.dayStart ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!data || !proposals) return null;

  const statuses = new Map(data.servicePoints.map((point) => [point.id, pointStatus(data, point)]));
  const firstMissing = data.servicePoints.find((point) => !statuses.get(point.id)?.isComplete);
  const selected =
    data.servicePoints.find((point) => point.id === selectedId) ??
    firstMissing ??
    data.servicePoints[0];
  const canEnter = hasPermission(ctx.role, "restaurant.morning-stock.enter");

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
      document.getElementById(`point-tab-${next.id}`)?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <p className="text-sm text-text-muted first-letter:uppercase">
          Journée du {formatLongDate(data.dayStart)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Stock du matin</h1>
      </div>

      <div
        role="tablist"
        aria-label="Points de service"
        onKeyDown={onTabsKeyDown}
        className="grid grid-cols-3 gap-2 sm:gap-4"
      >
        {data.servicePoints.map((point) => {
          const status = statuses.get(point.id);
          const isActive = point.id === selected?.id;
          const Icon = SERVICE_POINT_ICONS[point.kind];
          return (
            <button
              key={point.id}
              id={`point-tab-${point.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="morning-panel"
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
                {status?.isComplete ? (
                  <Badge tone="success" className="mt-1 text-[10px] sm:text-xs">
                    Saisi{status.lastEntry ? ` à ${formatTime(status.lastEntry.enteredAt)}` : ""}
                  </Badge>
                ) : (
                  <Badge tone="warning" className="mt-1 text-[10px] sm:text-xs">
                    {status && status.entered > 0
                      ? `${status.entered}/${status.required.length} saisis`
                      : "À saisir"}
                  </Badge>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <PointPanel
          key={selected.id}
          data={data}
          point={selected}
          status={statuses.get(selected.id) ?? pointStatus(data, selected)}
          proposals={proposals}
          canEnter={canEnter}
          onSubmitStart={() => setSelectedId(selected.id)}
        />
      ) : null}
    </div>
  );
}

function PointPanel({
  data,
  point,
  status,
  proposals,
  canEnter,
  onSubmitStart,
}: {
  data: DayData;
  point: ServicePoint;
  status: PointStatus;
  proposals: Map<string, number | null>;
  canEnter: boolean;
  /** Fige la sélection : le point reste affiché une fois complet. */
  onSubmitStart: () => void;
}) {
  const { db, ctx } = useRestaurant();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [draft, setDraft] = useState<Draft>(new Map());
  const [issues, setIssues] = useState<MorningLineIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = canEnter && (!status.isComplete || isCorrecting);
  const items = status.required;

  if (items.length === 0) {
    return (
      <Card id="morning-panel" role="tabpanel">
        <EmptyState
          icon={Sunrise}
          title="Aucun élément vendable à ce poste"
          description="Ajoutez des éléments avec un prix au menu de ce point de service."
        />
      </Card>
    );
  }

  const lines = items.map((item) => {
    const current = data.morningStock.get(item.id);
    const proposed = proposals.get(item.id) ?? null;
    const edit = draft.get(item.id);
    const defaultQuantity = current?.quantity ?? proposed;
    const quantityText =
      edit?.quantity ?? (defaultQuantity === null ? "" : String(defaultQuantity));
    const parsed = quantityText.trim() === "" ? null : Number(quantityText);
    return {
      item,
      current,
      proposed,
      quantityText,
      quantity: parsed,
      reason: edit?.reason ?? "",
      previous: current?.quantity ?? null,
    };
  });

  const issueById = new Map(issues.map((issue) => [issue.menuItemId, issue]));
  const varianceCount = lines.filter(
    (line) => line.quantity !== null && (morningVariance(line.proposed, line.quantity) ?? 0) !== 0,
  ).length;

  function update(itemId: string, patch: { quantity?: string; reason?: string }) {
    setDraft((current) => {
      const next = new Map(current);
      next.set(itemId, { ...next.get(itemId), ...patch });
      return next;
    });
    setIssues((current) => current.filter((issue) => issue.menuItemId !== itemId));
    setError(null);
    setSaved(null);
  }

  function step(itemId: string, quantity: number | null, delta: number) {
    update(itemId, { quantity: String(Math.max(0, (quantity ?? 0) + delta)) });
  }

  function resetToProposals() {
    setDraft(
      new Map(
        lines.map((line) => [
          line.item.id,
          { quantity: line.proposed === null ? "" : String(line.proposed) },
        ]),
      ),
    );
    setIssues([]);
  }

  async function submit() {
    onSubmitStart();
    const checked = lines.map((line) => ({
      menuItemId: line.item.id,
      name: line.item.name,
      quantity: line.quantity === null || Number.isNaN(line.quantity) ? null : line.quantity,
      proposed: line.proposed,
      previous: line.previous,
      reason: line.reason,
    }));
    const found = validateMorningLines(checked);
    setIssues(found);
    if (found.length > 0) {
      setError(`${found.length} ligne${found.length > 1 ? "s" : ""} à compléter avant validation.`);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const entries = await saveMorningStock(db, ctx, {
        servicePointId: point.id,
        lines: checked.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          reason: line.reason,
        })),
      });
      setDraft(new Map());
      setIsCorrecting(false);
      setSaved(
        entries.length === 0
          ? "Aucune modification à enregistrer."
          : `Stock du matin enregistré (${point.name}) à ${formatTime(new Date().toISOString())}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const history = data.morningEntries
    .filter((entry) => entry.servicePointId === point.id)
    .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
  const itemName = new Map(items.map((item) => [item.id, item.name]));

  return (
    <Card
      id="morning-panel"
      role="tabpanel"
      aria-labelledby={`point-tab-${point.id}`}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium sm:text-xl">
            {point.name} <span className="text-text-muted">· {unitLabel(items)}</span>
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {isEditing
              ? isCorrecting
                ? "Correction : chaque quantité modifiée exige un motif. La saisie précédente reste dans l'historique."
                : "Les quantités sont pré-remplies avec la proposition : confirmez ou corrigez."
              : status.lastEntry
                ? `Saisi par ${status.lastEntry.enteredByName || "le gérant"} à ${formatTime(status.lastEntry.enteredAt)}.`
                : "Pas encore saisi."}
          </p>
        </div>
        {isEditing ? (
          <Button variant="ghost" size="sm" onClick={resetToProposals}>
            <RotateCcw aria-hidden />
            Reprendre les propositions
          </Button>
        ) : canEnter ? (
          <Button variant="outline" size="sm" onClick={() => setIsCorrecting(true)}>
            <Pencil aria-hidden />
            Corriger
          </Button>
        ) : null}
      </div>

      <p className="flex items-start gap-2 rounded-md bg-bg-subtle px-3 py-2 text-xs text-text-muted">
        <Info aria-hidden className="mt-px size-4 shrink-0" />
        <span>
          Proposition = reste théorique de la veille (stock du matin moins ventes). Les réquisitions
          du jour s&apos;y ajouteront quand leur écran existera ; d&apos;ici là, justifiez les
          apports par le motif « Réquisition du jour ».
        </span>
      </p>

      {!canEnter ? (
        <p className="text-sm text-text-muted">Seul le gérant peut saisir le stock du matin.</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-border">
        <li
          aria-hidden
          className="hidden grid-cols-[minmax(0,1fr)_88px_164px_72px] gap-3 pb-2 text-xs text-text-muted md:grid"
        >
          <span>Élément</span>
          <span className="text-right">Proposé</span>
          <span className="text-center">{isEditing ? "Saisi" : "Quantité"}</span>
          <span className="text-right">Écart</span>
        </li>
        {lines.map((line) => {
          const variance =
            line.quantity === null || Number.isNaN(line.quantity)
              ? null
              : morningVariance(line.proposed, line.quantity);
          const needsReason =
            isEditing &&
            line.quantity !== null &&
            !Number.isNaN(line.quantity) &&
            requiresReason({
              proposed: line.proposed,
              quantity: line.quantity,
              previous: isCorrecting ? line.previous : null,
            });
          const issue = issueById.get(line.item.id);
          const inputId = `qty-${line.item.id}`;
          const reasonId = `reason-${line.item.id}`;
          return (
            <li key={line.item.id} className="py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_88px_164px_72px]">
                <div className="min-w-0">
                  <label htmlFor={inputId} className="block truncate text-sm font-medium">
                    {line.item.name}
                  </label>
                  <p className="text-xs text-text-muted md:hidden">
                    Proposé : {line.proposed ?? "—"}
                  </p>
                </div>
                <p className="hidden text-right text-sm text-text-muted tabular md:block">
                  {line.proposed ?? "—"}
                </p>
                {isEditing ? (
                  <div className="row-span-2 flex items-center justify-end gap-1 md:row-span-1 md:justify-center">
                    <IconButton
                      label={`Diminuer ${line.item.name}`}
                      onClick={() => step(line.item.id, line.quantity, -1)}
                    >
                      <Minus />
                    </IconButton>
                    <input
                      id={inputId}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={line.quantityText}
                      onChange={(event) =>
                        update(line.item.id, {
                          quantity: event.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                      aria-invalid={issue && issue.code !== "REASON_REQUIRED" ? true : undefined}
                      aria-describedby={issue ? `${inputId}-issue` : undefined}
                      className="h-11 w-16 rounded-sm border border-border-strong bg-surface text-center text-base font-semibold tabular focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none aria-[invalid=true]:border-danger"
                    />
                    <IconButton
                      label={`Augmenter ${line.item.name}`}
                      onClick={() => step(line.item.id, line.quantity, 1)}
                    >
                      <Plus />
                    </IconButton>
                  </div>
                ) : (
                  <p className="text-right text-sm font-semibold tabular md:text-center">
                    {line.current ? formatQuantity(line.current.quantity, line.item.unit) : "—"}
                  </p>
                )}
                <div className="flex justify-start md:justify-end">
                  <VarianceBadge variance={variance} />
                </div>
              </div>

              {needsReason ? (
                <div className="mt-2 flex flex-col gap-2 md:pl-0">
                  <label htmlFor={reasonId} className="text-xs font-medium">
                    Motif de l&apos;écart
                  </label>
                  <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {DEFAULT_MORNING_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => update(line.item.id, { reason })}
                        aria-pressed={line.reason === reason}
                        className={cn(
                          "h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150",
                          line.reason === reason
                            ? "border-action bg-action text-on-action"
                            : "border-border-strong bg-surface text-text hover:bg-bg-subtle",
                        )}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <input
                    id={reasonId}
                    value={line.reason}
                    onChange={(event) => update(line.item.id, { reason: event.target.value })}
                    placeholder="Précisez si besoin…"
                    maxLength={160}
                    aria-invalid={issue?.code === "REASON_REQUIRED" ? true : undefined}
                    aria-describedby={issue ? `${inputId}-issue` : undefined}
                    className="h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30 focus:outline-none aria-[invalid=true]:border-danger"
                  />
                </div>
              ) : null}

              {!isEditing && line.current?.reason ? (
                <p className="mt-1 text-xs text-text-muted">Motif : {line.current.reason}</p>
              ) : null}

              {issue ? (
                <p id={`${inputId}-issue`} role="alert" className="mt-1.5 text-xs text-danger">
                  {issue.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md bg-success-subtle px-3 py-2 text-sm"
        >
          <Check aria-hidden className="size-4 text-success" />
          {saved}
        </p>
      ) : null}

      {isEditing ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">
            {items.length} élément{items.length > 1 ? "s" : ""} · {varianceCount} écart
            {varianceCount > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            {isCorrecting ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setIsCorrecting(false);
                  setDraft(new Map());
                  setIssues([]);
                  setError(null);
                }}
              >
                Annuler
              </Button>
            ) : null}
            <Button
              variant="action"
              size="lg"
              className="flex-1 sm:flex-none"
              disabled={isSaving}
              onClick={() => void submit()}
            >
              <Check aria-hidden />
              {isSaving ? "Enregistrement…" : `Valider le stock · ${point.name}`}
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="border-t border-border pt-3 text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-text-muted hover:text-text">
            <History aria-hidden className="size-4" />
            Historique des saisies du jour ({history.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2 text-xs text-text-muted">
                <span className="tabular">{formatTime(entry.enteredAt)}</span>
                <span className="font-medium text-text">{itemName.get(entry.menuItemId)}</span>
                <span className="tabular">→ {entry.quantity}</span>
                {entry.replacesId ? <span>(correction)</span> : null}
                {entry.reason ? <span>· {entry.reason}</span> : null}
                <span>· {entry.enteredByName}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null || variance === 0) {
    return <span className="text-xs text-text-muted">{variance === 0 ? "—" : ""}</span>;
  }
  return (
    <Badge tone={variance > 0 ? "accent" : "danger"} className="tabular">
      {variance > 0 ? `+${variance}` : `−${Math.abs(variance)}`}
    </Badge>
  );
}
