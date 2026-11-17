"use client";

import { Check, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, Input, Select, Textarea } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import { formatDay } from "@/modules/restaurant/domain/period";

import { recordAdjustmentAction, validatePeriodAction } from "../actions";

/** Validation d'une période dont l'aperçu est affiché (EF-CLO-05, D-064). */
export function ValidatePeriodForm({ slug, from, to }: { slug: string; from: string; to: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await validatePeriodAction({ slug, from, to, comment });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/e/${slug}/clotures?cloturee=${from}`);
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <Field label="Commentaire" optional>
        {({ id }) => (
          <Textarea
            id={id}
            rows={2}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        )}
      </Field>
      <p className="text-xs text-text-muted">
        Une fois clôturée, la période est définitive : ses journées ne se corrigent plus.
      </p>
      <Button type="submit" variant="action" className="self-start" disabled={isSaving}>
        <Check aria-hidden />
        {isSaving ? "Clôture…" : `Clôturer la période du ${formatDay(from)} au ${formatDay(to)}`}
      </Button>
    </form>
  );
}

type Kind = "cash" | "stock";

/**
 * Écriture d'ajustement (RG-CLO-02, D-064) : une journée validée ne se
 * modifie pas ; une erreur se corrige par une écriture datée et motivée.
 */
export function AdjustmentSheet({
  slug,
  days,
  people,
  items,
}: {
  slug: string;
  /** Journées validées hors période clôturée, de la plus récente à la plus ancienne. */
  days: string[];
  people: { userId: string; name: string }[];
  items: { servicePointId: string; menuItemId: string; label: string }[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("cash");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = Number(String(form.get("value") ?? "").replace(/\s/g, ""));
    const signedValue = Number.isFinite(value) ? Math.abs(value) * direction : Number.NaN;
    const day = String(form.get("day") ?? "");
    const reason = String(form.get("reason") ?? "");
    setIsSaving(true);
    setError(null);
    const result =
      kind === "cash"
        ? await recordAdjustmentAction({
            slug,
            adjustment: {
              kind,
              day,
              userId: String(form.get("userId") ?? ""),
              amountMajor: signedValue,
              reason,
            },
          })
        : await recordAdjustmentAction({
            slug,
            adjustment: {
              kind,
              day,
              servicePointId:
                items.find((item) => item.menuItemId === form.get("menuItemId"))?.servicePointId ??
                "",
              menuItemId: String(form.get("menuItemId") ?? ""),
              quantity: signedValue,
              reason,
            },
          });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setIsOpen(false);
    router.refresh();
  }

  const directions =
    kind === "cash"
      ? [
          { value: 1 as const, label: "Argent retrouvé" },
          { value: -1 as const, label: "Manquant constaté" },
        ]
      : [
          { value: 1 as const, label: "Stock en plus" },
          { value: -1 as const, label: "Stock en moins" },
        ];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        disabled={days.length === 0}
      >
        <PenLine aria-hidden />
        Corriger une journée
      </Button>
      <Sheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Corriger une journée validée"
        description="La clôture reste telle quelle ; la correction s'ajoute, datée, motivée et tracée au journal."
        footer={
          <Button
            type="submit"
            form="adjustment-form"
            variant="action"
            className="w-full"
            disabled={isSaving}
          >
            <Check aria-hidden />
            {isSaving ? "Enregistrement…" : "Enregistrer la correction"}
          </Button>
        }
      >
        <form
          id="adjustment-form"
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="flex flex-col gap-4"
        >
          {error ? (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <div
            role="radiogroup"
            aria-label="Que corriger ?"
            className="grid grid-cols-2 gap-1 rounded-md bg-bg-subtle p-1"
          >
            {(
              [
                { value: "cash", label: "Caisse" },
                { value: "stock", label: "Stock" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={kind === option.value}
                onClick={() => setKind(option.value)}
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
          <Field label="Journée">
            {({ id }) => (
              <Select id={id} name="day" defaultValue={days[0]}>
                {days.map((day) => (
                  <option key={day} value={day}>
                    {formatDay(day)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind === "cash" ? (
            <Field
              label="Personne"
              hint="Le manquant ou l'argent retrouvé lui est attribué (RG-CLO-01)."
            >
              {({ id, describedBy }) => (
                <Select id={id} name="userId" aria-describedby={describedBy}>
                  {people.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Élément">
              {({ id }) => (
                <Select id={id} name="menuItemId">
                  {items.map((item) => (
                    <option key={item.menuItemId} value={item.menuItemId}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div
            role="radiogroup"
            aria-label="Sens de la correction"
            className="grid grid-cols-2 gap-2"
          >
            {directions.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm",
                  direction === option.value
                    ? "border-action bg-bg-subtle"
                    : "border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  checked={direction === option.value}
                  onChange={() => setDirection(option.value)}
                  className="size-5 accent-action"
                />
                {option.label}
              </label>
            ))}
          </div>
          <Field label={kind === "cash" ? "Montant (FC)" : "Quantité"}>
            {({ id }) => (
              <Input
                id={id}
                name="value"
                inputMode="numeric"
                autoComplete="off"
                className="tabular"
              />
            )}
          </Field>
          <Field label="Motif" hint="Obligatoire : il figure au journal d'audit.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                name="reason"
                rows={3}
                maxLength={200}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        </form>
      </Sheet>
    </>
  );
}
