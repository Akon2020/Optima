"use client";

import { Beer, Eye, ListPlus, Plus, UtensilsCrossed } from "lucide-react";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney, sumMoney } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Field, Input, Select, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";
import { Tabs } from "@/shared/ui/tabs";

import { SALE_UNIT_LABELS, formatQuantity, itemsForMenu } from "../../domain/menu";
import { MAX_FORMULA_COMPONENTS, isFormula } from "../../domain/menu-options";
import type { MenuItem, MenuKind, SaleUnit } from "../../domain/types";
import { useDayData, type DayData } from "../../offline/hooks";
import { addMenuItem } from "../../offline/repository";
import { menuItemInputSchema } from "../../schemas/menu-item";
import { hasPermission } from "../../permissions";
import { availabilityBadge, categoryVisual } from "../labels";
import { OptionGroupsEditorSheet } from "../menus/option-groups-editor";
import { useRestaurant } from "../restaurant-provider";

const TILE: Record<string, string> = {
  green: "bg-kpi-green-bg text-kpi-green-fg",
  rose: "bg-kpi-rose-bg text-kpi-rose-fg",
  yellow: "bg-kpi-yellow-bg text-kpi-yellow-fg",
  peach: "bg-kpi-peach-bg text-kpi-peach-fg",
  grey: "bg-kpi-grey-bg text-kpi-grey-fg",
};

/** Menus boissons et nourriture (EF-RES-02, EF-RES-03, maquette « Products »). */
export function MenusScreen() {
  const data = useDayData();
  const [menu, setMenu] = useState<MenuKind>("drinks");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [optionsId, setOptionsId] = useState<string | null>(null);

  if (!data) return null;

  const items = itemsForMenu(data.menuItems, data.servicePoints, menu).sort(
    (a, b) => a.category.localeCompare(b.category, "fr") || a.name.localeCompare(b.name, "fr"),
  );
  const toPrice = data.menuItems.filter((item) => item.archivedAt === null && item.price === null);
  const detail = data.menuItems.find((item) => item.id === detailId) ?? null;
  const editing = data.menuItems.find((item) => item.id === optionsId) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Menus</h1>
          <p className="text-sm text-text-muted">
            Prix et disponibilités du jour. Seul le gérant modifie les prix (RG-RES-02).
          </p>
        </div>
        {toPrice.length > 0 ? (
          <Badge tone="danger">
            {toPrice.length} élément{toPrice.length > 1 ? "s" : ""} sans prix
          </Badge>
        ) : null}
      </div>

      <div className="rounded-card bg-surface px-4 shadow-card">
        <Tabs<MenuKind>
          label="Menu"
          value={menu}
          onChange={setMenu}
          items={[
            {
              value: "drinks",
              label: "Boissons",
              icon: Beer,
              count: itemsForMenu(data.menuItems, data.servicePoints, "drinks").length,
            },
            {
              value: "food",
              label: "Nourriture",
              icon: UtensilsCrossed,
              count: itemsForMenu(data.menuItems, data.servicePoints, "food").length,
            },
          ]}
        />
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <MenuCard item={item} data={data} onOpen={() => setDetailId(item.id)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-strong bg-surface/60 p-4 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-action hover:text-text"
          >
            <Plus aria-hidden className="size-6" />
            Ajouter un élément
          </button>
        </li>
      </ul>

      <AddMenuItemSheet
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        data={data}
        defaultMenu={menu}
      />
      <MenuItemDetailSheet
        item={detail}
        data={data}
        onClose={() => setDetailId(null)}
        onEditOptions={(item) => {
          setDetailId(null);
          setOptionsId(item.id);
        }}
      />
      <OptionGroupsEditorSheet item={editing} onClose={() => setOptionsId(null)} />
    </div>
  );
}

function MenuCard({ item, data, onOpen }: { item: MenuItem; data: DayData; onOpen: () => void }) {
  const visual = categoryVisual(item.category);
  const Icon = visual.icon;
  const badge = availabilityBadge(data.availability.get(item.id));
  const point = data.servicePoints.find((p) => p.id === item.servicePointId);

  return (
    <article className="flex h-full flex-col rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className={cn(
            "grid size-14 place-items-center rounded-card sm:size-16",
            TILE[visual.tone],
          )}
        >
          <Icon className="size-7" />
        </span>
        {badge ? (
          <Badge tone={badge.tone} className="text-[10px]">
            {badge.label}
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] leading-snug font-semibold">{item.name}</h3>
      <p className="mt-0.5 text-xs text-text-muted">
        {isFormula(item)
          ? `Formule · ${(item.components ?? []).length} éléments`
          : `${point?.name ?? ""} · ${SALE_UNIT_LABELS[item.unit].one}`}
        {(item.optionGroups ?? []).length > 0 ? " · options" : null}
      </p>
      {item.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-text-muted">{item.description}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <p className={cn("text-base font-semibold tabular", !item.price && "text-danger")}>
          {item.price ? formatMoney(item.price) : "À fixer"}
        </p>
        <IconButton label={`Voir ${item.name}`} size="sm" onClick={onOpen}>
          <Eye />
        </IconButton>
      </div>
    </article>
  );
}

function MenuItemDetailSheet({
  item,
  data,
  onClose,
  onEditOptions,
}: {
  item: MenuItem | null;
  data: DayData;
  onClose: () => void;
  onEditOptions: (item: MenuItem) => void;
}) {
  const { ctx } = useRestaurant();
  const canManage = hasPermission(ctx.role, "restaurant.menu.manage");
  const morning = item ? data.morningStock.get(item.id) : undefined;
  const sold = item ? (data.soldByItem.get(item.id) ?? 0) : 0;
  const badge = item ? availabilityBadge(data.availability.get(item.id)) : null;
  const point = item ? data.servicePoints.find((p) => p.id === item.servicePointId) : undefined;

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={item?.name ?? ""}
      description={item ? `${point?.name ?? ""} · ${item.category}` : undefined}
    >
      {item && isFormula(item) ? (
        <FormulaDetail item={item} data={data} />
      ) : item ? (
        <dl className="grid grid-cols-2 gap-3">
          {[
            { label: "Prix de vente", value: item.price ? formatMoney(item.price) : "À fixer" },
            { label: "Unité de vente", value: SALE_UNIT_LABELS[item.unit].one },
            {
              label: "Stock du matin",
              value: morning ? formatQuantity(morning.quantity, item.unit) : "Non saisi",
            },
            { label: "Vendu aujourd'hui", value: formatQuantity(sold, item.unit) },
          ].map((entry) => (
            <div key={entry.label} className="rounded-lg bg-bg-subtle p-3">
              <dt className="text-xs text-text-muted">{entry.label}</dt>
              <dd className="mt-1 text-base font-semibold tabular">{entry.value}</dd>
            </div>
          ))}
          <div className="col-span-2 rounded-lg bg-bg-subtle p-3">
            <dt className="text-xs text-text-muted">Disponibilité</dt>
            <dd className="mt-1">{badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : "—"}</dd>
          </div>
          {item.description ? (
            <div className="col-span-2">
              <dt className="text-xs text-text-muted">Description</dt>
              <dd className="mt-1 text-sm">{item.description}</dd>
            </div>
          ) : null}
          <div className="col-span-2">
            <dt className="text-xs text-text-muted">Options</dt>
            <dd className="mt-1 flex flex-col gap-2 text-sm">
              {(item.optionGroups ?? []).length === 0 ? (
                <span className="text-text-muted">Aucune option.</span>
              ) : (
                (item.optionGroups ?? []).map((group) => (
                  <p key={group.id}>
                    <span className="font-medium">{group.name}</span>
                    <span className="text-text-muted">
                      {group.isRequired ? " (obligatoire)" : ""} :{" "}
                      {group.options
                        .map((option) =>
                          option.priceDelta.amountMinor > 0
                            ? `${option.name} + ${formatMoney(option.priceDelta)}`
                            : option.name,
                        )
                        .join(", ")}
                    </span>
                  </p>
                ))
              )}
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => onEditOptions(item)}
                >
                  <ListPlus aria-hidden />
                  Gérer les options
                </Button>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : null}
    </Sheet>
  );
}

/** Détail d'une formule : ses éléments, leur prix au menu et l'économie offerte (D-060). */
function FormulaDetail({ item, data }: { item: MenuItem; data: DayData }) {
  const { ctx } = useRestaurant();
  const parts = (item.components ?? []).flatMap((id) => {
    const part = data.menuItems.find((entry) => entry.id === id);
    return part ? [part] : [];
  });
  const separate = sumMoney(
    parts.flatMap((part) => (part.price ? [part.price] : [])),
    ctx.settings.currency,
  );
  const badge = availabilityBadge(data.availability.get(item.id));
  return (
    <dl className="grid grid-cols-2 gap-3">
      <div className="rounded-lg bg-bg-subtle p-3">
        <dt className="text-xs text-text-muted">Prix de la formule</dt>
        <dd className="mt-1 text-base font-semibold tabular">
          {item.price ? formatMoney(item.price) : "À fixer"}
        </dd>
      </div>
      <div className="rounded-lg bg-bg-subtle p-3">
        <dt className="text-xs text-text-muted">Prix séparés</dt>
        <dd className="mt-1 text-base font-semibold tabular">{formatMoney(separate)}</dd>
      </div>
      <div className="col-span-2 rounded-lg bg-bg-subtle p-3">
        <dt className="text-xs text-text-muted">Disponibilité</dt>
        <dd className="mt-1">{badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : "—"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-xs text-text-muted">Éléments, envoyés chacun à son poste</dt>
        <dd className="mt-1">
          <ul className="flex flex-col divide-y divide-border text-sm">
            {parts.map((part, index) => (
              <li key={`${part.id}-${index}`} className="flex justify-between gap-3 py-2">
                <span>
                  {part.name}
                  <span className="block text-xs text-text-muted">
                    {data.servicePoints.find((p) => p.id === part.servicePointId)?.name}
                  </span>
                </span>
                <span className="tabular text-text-muted">
                  {part.price ? formatMoney(part.price) : "À fixer"}
                </span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
      {item.description ? (
        <div className="col-span-2">
          <dt className="text-xs text-text-muted">Description</dt>
          <dd className="mt-1 text-sm">{item.description}</dd>
        </div>
      ) : null}
    </dl>
  );
}

type FieldErrors = Partial<
  Record<
    "name" | "servicePointId" | "unit" | "category" | "description" | "priceMajor" | "components",
    string
  >
>;

const DEFAULT_UNIT: Record<string, SaleUnit> = {
  counter: "bottle",
  kitchen: "dish",
  grill: "piece",
};

/** Panneau « Nouvel élément de menu » (maquette « Add new product », EF-RES-03). */
function AddMenuItemSheet({
  open,
  onOpenChange,
  data,
  defaultMenu,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DayData;
  defaultMenu: MenuKind;
}) {
  const { db, ctx } = useRestaurant();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const defaultPoint =
    data.servicePoints.find((point) => point.menu === defaultMenu) ?? data.servicePoints[0];
  const [servicePointId, setServicePointId] = useState(defaultPoint?.id ?? "");
  const [unit, setUnit] = useState<SaleUnit>(
    defaultPoint ? (DEFAULT_UNIT[defaultPoint.kind] ?? "dish") : "dish",
  );
  // D-060 : une formule regroupe des éléments du menu à un prix propre.
  const [kind, setKind] = useState<"simple" | "formula">("simple");
  const [components, setComponents] = useState<string[]>([]);
  const candidates = data.menuItems
    .filter((item) => item.archivedAt === null && !isFormula(item) && item.price !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const separatePrice = sumMoney(
    components.flatMap((id) => {
      const price = data.menuItems.find((item) => item.id === id)?.price;
      return price ? [price] : [];
    }),
    ctx.settings.currency,
  );

  function onOpenChangeInternal(next: boolean) {
    if (next && defaultPoint) {
      setServicePointId(defaultPoint.id);
      setUnit(DEFAULT_UNIT[defaultPoint.kind] ?? "dish");
    }
    if (next) {
      setKind("simple");
      setComponents([]);
    }
    setErrors({});
    setFormError(null);
    onOpenChange(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priceText = String(form.get("price") ?? "").replace(/\s/g, "");
    const parsed = menuItemInputSchema.safeParse({
      name: String(form.get("name") ?? ""),
      servicePointId,
      unit: kind === "formula" ? "dish" : unit,
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      priceMajor: priceText === "" ? null : Number(priceText),
      kind,
      components: kind === "formula" ? components : [],
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setIsSaving(true);
    try {
      await addMenuItem(db, ctx, parsed.data);
      onOpenChangeInternal(false);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChangeInternal}
      title={kind === "formula" ? "Nouvelle formule" : "Nouvel élément de menu"}
      footer={
        <Button
          type="submit"
          form="add-menu-item"
          variant="action"
          size="lg"
          className="w-full"
          disabled={isSaving}
        >
          <Plus aria-hidden />
          {isSaving ? "Enregistrement…" : "Ajouter au menu"}
        </Button>
      }
    >
      <form
        id="add-menu-item"
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {formError ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
            {formError}
          </p>
        ) : null}
        <div
          role="radiogroup"
          aria-label="Type d'élément"
          className="grid grid-cols-2 gap-1 rounded-md bg-bg-subtle p-1"
        >
          {(
            [
              { value: "simple", label: "Élément" },
              { value: "formula", label: "Formule" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => {
                setKind(option.value);
                setErrors({});
              }}
              className={cn(
                "h-11 rounded-sm text-sm font-medium transition-colors duration-150",
                kind === option.value
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Field
          label={kind === "formula" ? "Nom de la formule" : "Nom de l'élément"}
          error={errors.name}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="name"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        {kind === "formula" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex w-full items-baseline justify-between text-xs font-medium">
              <span>Éléments de la formule</span>
              <span className="font-normal text-text-muted tabular">
                {components.length} / {MAX_FORMULA_COMPONENTS}
              </span>
            </legend>
            <p className="text-xs text-text-muted">
              Chaque élément part à son poste et compte dans son stock. Prix séparés :{" "}
              <span className="tabular">{formatMoney(separatePrice)}</span>.
            </p>
            <ul className="flex max-h-64 flex-col overflow-y-auto rounded-md border border-border-strong">
              {candidates.map((candidate) => {
                const isChecked = components.includes(candidate.id);
                return (
                  <li key={candidate.id} className="border-b border-border last:border-b-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isChecked && components.length >= MAX_FORMULA_COMPONENTS}
                        onChange={() => {
                          setComponents((current) =>
                            isChecked
                              ? current.filter((id) => id !== candidate.id)
                              : [...current, candidate.id],
                          );
                          setErrors((current) => {
                            const next = { ...current };
                            delete next.components;
                            return next;
                          });
                        }}
                        className="size-5 accent-action"
                      />
                      <span className="flex-1">{candidate.name}</span>
                      <span className="text-xs text-text-muted tabular">
                        {candidate.price ? formatMoney(candidate.price) : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {errors.components ? (
              <p role="alert" className="text-xs text-danger">
                {errors.components}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={kind === "formula" ? "Affichée dans" : "Point de service"}
            error={errors.servicePointId}
            className={kind === "formula" ? "col-span-2" : ""}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                value={servicePointId}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setServicePointId(event.target.value);
                  const point = data.servicePoints.find((p) => p.id === event.target.value);
                  if (point) setUnit(DEFAULT_UNIT[point.kind] ?? "dish");
                }}
              >
                {data.servicePoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind === "formula" ? null : (
            <Field label="Unité de vente" error={errors.unit}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  value={unit}
                  aria-describedby={describedBy}
                  onChange={(event) => setUnit(event.target.value as SaleUnit)}
                >
                  {(Object.keys(SALE_UNIT_LABELS) as SaleUnit[]).map((key) => (
                    <option key={key} value={key}>
                      {SALE_UNIT_LABELS[key].one}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        <Field
          label="Catégorie"
          optional
          error={errors.category}
          hint="Par exemple : Bières, Poissons, Accompagnements."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="category"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field
          label={kind === "formula" ? "Prix de la formule (FC)" : "Prix de vente (FC)"}
          optional={kind !== "formula"}
          error={errors.priceMajor}
          hint={
            kind === "formula"
              ? "Réparti entre les postes au prorata des prix séparés."
              : "Laissé vide, l'élément apparaît « À fixer » et ne peut pas être vendu."
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="price"
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <Field label="Description" optional error={errors.description}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="description"
              rows={3}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
