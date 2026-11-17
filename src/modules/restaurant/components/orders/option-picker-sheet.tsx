"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { formatMoney, type Currency } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Sheet } from "@/shared/ui/sheet";

import { cartLinePrice, optionChoiceIssue } from "../../domain/menu-options";
import type { MenuItem, OptionGroup } from "../../domain/types";

/**
 * Choix des options d'un élément avant de l'ajouter au panier (D-035, D-060) :
 * un choix par groupe à choix unique, plusieurs pour les autres ; les groupes
 * obligatoires doivent être renseignés.
 */
export function OptionPickerSheet({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  currency: Currency;
  onClose: () => void;
  onAdd: (item: MenuItem, optionIds: string[]) => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={item?.name ?? ""}
      description="Choisissez les options avant d'ajouter l'élément."
    >
      {item ? <OptionPicker key={item.id} item={item} currency={currency} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function OptionPicker({
  item,
  currency,
  onAdd,
}: {
  item: MenuItem;
  currency: Currency;
  onAdd: (item: MenuItem, optionIds: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const issue = optionChoiceIssue(item, chosen);
  const price = cartLinePrice(item, chosen, currency);

  function toggle(group: OptionGroup, optionId: string) {
    setChosen((current) => {
      if (group.isMultiple) {
        return current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
      }
      const others = current.filter((id) => !group.options.some((option) => option.id === id));
      return current.includes(optionId) && !group.isRequired ? others : [...others, optionId];
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {(item.optionGroups ?? []).map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-baseline justify-between gap-2 text-sm font-medium">
            <span>{group.name}</span>
            <span className="text-xs font-normal text-text-muted">
              {group.isRequired ? "Obligatoire" : "Facultatif"}
              {group.isMultiple ? " · plusieurs choix" : " · un choix"}
            </span>
          </legend>
          {group.options.map((option) => {
            const isChecked = chosen.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors duration-150",
                  isChecked ? "border-action bg-bg-subtle" : "border-border-strong",
                )}
              >
                <input
                  type={group.isMultiple ? "checkbox" : "radio"}
                  name={group.id}
                  checked={isChecked}
                  onChange={() => toggle(group, option.id)}
                  onClick={() => {
                    // Un groupe facultatif à choix unique se décoche d'un second appui.
                    if (!group.isMultiple && !group.isRequired && isChecked) {
                      toggle(group, option.id);
                    }
                  }}
                  className="size-5 accent-action"
                />
                <span className="flex-1">{option.name}</span>
                <span className="text-xs text-text-muted tabular">
                  {option.priceDelta.amountMinor > 0
                    ? `+ ${formatMoney(option.priceDelta)}`
                    : "Inclus"}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      {issue && chosen.length > 0 ? (
        <p role="status" className="text-sm text-text-muted">
          {issue.message}
        </p>
      ) : null}
      <Button
        variant="action"
        size="lg"
        className="w-full"
        disabled={issue !== null}
        onClick={() => onAdd(item, chosen)}
      >
        <Plus aria-hidden />
        Ajouter · {formatMoney(price)}
      </Button>
    </div>
  );
}
