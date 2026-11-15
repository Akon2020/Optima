"use client";

import { Check, ClipboardCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { StatusLabel } from "@/shared/ui/badge";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { Tabs } from "@/shared/ui/tabs";

import {
  DEFAULT_OUT_REASONS,
  MIN_COMMENT_LENGTH,
  expectedStockOf,
  stockLineVariance,
} from "../../domain/closing";
import type { StockCountLine } from "../../domain/types";
import type { ClosingData, DayData } from "../../offline/hooks";
import { recordStockCount } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { restaurantHref } from "../shell/nav-items";
import { useRestaurant } from "../restaurant-provider";
import { stockVarianceLabel } from "./closing-labels";

type LineDraft = { counted: string; declaredOut: string; outReason: string };

/**
 * Comptage de fin de service (EF-CLO-03, D-044) : pour chaque élément du
 * point de service, stock du matin, ventes, stock attendu, sorties déclarées
 * (casse, perte, repas du personnel) et stock compté ; l'écart en découle.
 */
export function StockCountPanel({ data, closing }: { data: DayData; closing: ClosingData }) {
  const { ctx, slug } = useRestaurant();
  const points = data.servicePoints.filter(
    (point) => (closing.stockDrafts.get(point.id) ?? []).length > 0,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = points.find((point) => point.id === selectedId) ?? points[0];
  const canCount =
    hasPermission(ctx.role, "restaurant.closing.count-stock") && !closing.status.isValidated;

  if (!selected) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardCheck}
          title="Rien à compter"
          description="Aucun point de service n'a d'élément vendable au menu."
        />
      </Card>
    );
  }

  const missingMorning = closing.status.pointsMissingMorningStock.some(
    (point) => point.id === selected.id,
  );

  return (
    <Card aria-labelledby="stock-count-title">
      <CardHeader
        titleId="stock-count-title"
        title="Stock de fin de service"
        description="Stock attendu = stock du matin − ventes. Les pertes, la casse et les repas du personnel se déclarent à part."
      />
      <Tabs
        label="Points de service"
        value={selected.id}
        onChange={setSelectedId}
        items={points.map((point) => ({
          value: point.id,
          label: point.name,
          ...(closing.status.stockCounts.has(point.id) ? { icon: Check } : {}),
        }))}
        className="mb-4 border-b border-border"
      />
      {missingMorning ? (
        <p className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-sm">
          Le stock du matin de ce point n&apos;a pas été saisi : la journée ne pourra pas être
          validée (RG-REQ-03).{" "}
          <Link
            href={restaurantHref(slug, "stock-du-matin")}
            className="font-medium underline underline-offset-2"
          >
            Saisir le stock du matin
          </Link>
        </p>
      ) : null}
      <PointCount
        key={selected.id}
        servicePointId={selected.id}
        closing={closing}
        canCount={canCount}
      />
    </Card>
  );
}

function PointCount({
  servicePointId,
  closing,
  canCount,
}: {
  servicePointId: string;
  closing: ClosingData;
  canCount: boolean;
}) {
  const { db, ctx } = useRestaurant();
  const draftLines = closing.stockDrafts.get(servicePointId) ?? [];
  const existing = closing.status.stockCounts.get(servicePointId);
  const [isRecounting, setIsRecounting] = useState(false);
  const [draft, setDraft] = useState<Map<string, LineDraft>>(new Map());
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = canCount && (!existing || isRecounting);

  if (!isEditing) {
    if (!existing) {
      return (
        <p className="text-sm text-text-muted">
          Pas encore compté. Seul le gérant compte le stock en fin de service.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Compté par {existing.countedByName || "le gérant"} à {formatTime(existing.countedAt)}
        </p>
        <CountLines lines={existing.lines} />
        {existing.comment ? (
          <p className="text-sm">
            <span className="text-text-muted">Commentaire :</span> {existing.comment}
          </p>
        ) : null}
        {canCount ? (
          <Button variant="outline" className="self-start" onClick={() => setIsRecounting(true)}>
            <RotateCcw aria-hidden />
            Recompter
          </Button>
        ) : null}
      </div>
    );
  }

  const lines = draftLines.map((line) => {
    const edit = draft.get(line.menuItemId);
    const countedText = edit?.counted ?? "";
    const outText = edit?.declaredOut ?? "";
    const counted = /^\d+$/.test(countedText.trim()) ? Number(countedText) : null;
    const declaredOut = /^\d+$/.test(outText.trim()) ? Number(outText) : 0;
    return {
      line,
      countedText,
      outText,
      outReason: edit?.outReason ?? "",
      variance: counted === null ? undefined : stockLineVariance({ ...line, declaredOut, counted }),
      counted,
      declaredOut,
    };
  });
  const hasVariance = lines.some(
    (entry) => entry.variance !== undefined && entry.variance !== null && entry.variance !== 0,
  );
  const isComplete = lines.every((entry) => entry.counted !== null);

  function update(menuItemId: string, patch: Partial<LineDraft>) {
    setDraft((current) => {
      const next = new Map(current);
      next.set(menuItemId, {
        counted: "",
        declaredOut: "",
        outReason: "",
        ...next.get(menuItemId),
        ...patch,
      });
      return next;
    });
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await recordStockCount(db, ctx, {
        servicePointId,
        lines: lines.map((entry) => ({
          menuItemId: entry.line.menuItemId,
          counted: entry.counted,
          declaredOut: entry.declaredOut,
          outReason: entry.outReason,
        })),
        comment,
      });
      setDraft(new Map());
      setComment("");
      setIsRecounting(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        <li
          aria-hidden
          className="hidden grid-cols-[minmax(0,1fr)_64px_64px_72px_96px_96px_120px] gap-3 pb-2 text-xs text-text-muted lg:grid"
        >
          <span>Élément</span>
          <span className="text-right">Matin</span>
          <span className="text-right">Vendu</span>
          <span className="text-right">Attendu</span>
          <span>Sorties</span>
          <span>Compté</span>
          <span className="text-right">Écart</span>
        </li>
        {lines.map((entry) => {
          const expected = expectedStockOf(entry.line);
          const variance = entry.variance === undefined ? null : stockVarianceLabel(entry.variance);
          return (
            <li
              key={entry.line.menuItemId}
              className="grid grid-cols-2 gap-x-3 gap-y-2 py-3 lg:grid-cols-[minmax(0,1fr)_64px_64px_72px_96px_96px_120px] lg:items-center"
            >
              <p className="col-span-2 text-sm font-medium lg:col-span-1">{entry.line.name}</p>
              <p className="text-xs text-text-muted lg:text-right lg:text-sm lg:text-text">
                <span className="lg:sr-only">Matin </span>
                <span className="tabular">{entry.line.morning ?? "—"}</span>
              </p>
              <p className="text-xs text-text-muted lg:text-right lg:text-sm lg:text-text">
                <span className="lg:sr-only">Vendu </span>
                <span className="tabular">{entry.line.sold}</span>
              </p>
              <p className="col-span-2 text-xs text-text-muted lg:col-span-1 lg:text-right lg:text-sm lg:font-semibold lg:text-text">
                <span className="lg:sr-only">Attendu </span>
                <span className="tabular">{expected ?? "—"}</span>
              </p>
              <Input
                aria-label={`Sorties déclarées, ${entry.line.name}`}
                inputMode="numeric"
                placeholder="Sorties"
                value={entry.outText}
                onChange={(event) =>
                  update(entry.line.menuItemId, { declaredOut: event.target.value })
                }
                className="tabular"
              />
              <Input
                aria-label={`Stock compté, ${entry.line.name}`}
                inputMode="numeric"
                placeholder="Compté"
                value={entry.countedText}
                onChange={(event) => update(entry.line.menuItemId, { counted: event.target.value })}
                className="tabular"
              />
              <div className="col-span-2 lg:col-span-1 lg:text-right" aria-live="polite">
                {variance ? (
                  <StatusLabel tone={variance.tone} className="text-sm">
                    {variance.label}
                  </StatusLabel>
                ) : (
                  <span className="text-xs text-text-muted">À compter</span>
                )}
              </div>
              {entry.declaredOut > 0 ? (
                <div className="col-span-2 lg:col-span-7">
                  <Input
                    aria-label={`Motif des sorties, ${entry.line.name}`}
                    list="out-reasons"
                    placeholder="Motif : casse, perte, repas du personnel…"
                    value={entry.outReason}
                    maxLength={160}
                    onChange={(event) =>
                      update(entry.line.menuItemId, { outReason: event.target.value })
                    }
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <datalist id="out-reasons">
        {DEFAULT_OUT_REASONS.map((reason) => (
          <option key={reason} value={reason} />
        ))}
      </datalist>

      <Field
        label="Commentaire"
        optional={!hasVariance}
        hint={
          hasVariance
            ? `Obligatoire : expliquez les écarts (${MIN_COMMENT_LENGTH} caractères au moins).`
            : undefined
        }
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            rows={2}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="action" disabled={isSaving || !isComplete}>
          <Check aria-hidden />
          Enregistrer le comptage
        </Button>
        {isRecounting ? (
          <button
            type="button"
            className={buttonClasses("ghost")}
            onClick={() => setIsRecounting(false)}
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Lignes d'un comptage enregistré (lecture seule). */
export function CountLines({ lines }: { lines: readonly StockCountLine[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {lines.map((line) => {
        const variance = stockVarianceLabel(stockLineVariance(line));
        return (
          <li
            key={line.menuItemId}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <span className="min-w-0">
              <span className="font-medium">{line.name}</span>
              <span className="block text-xs text-text-muted tabular">
                matin {line.morning ?? "—"} · vendu {line.sold} · compté {line.counted}
                {line.declaredOut > 0
                  ? ` · sorties ${line.declaredOut} (${line.outReason ?? "sans motif"})`
                  : ""}
              </span>
            </span>
            <StatusLabel tone={variance.tone} className="text-xs">
              {variance.label}
            </StatusLabel>
          </li>
        );
      })}
    </ul>
  );
}
