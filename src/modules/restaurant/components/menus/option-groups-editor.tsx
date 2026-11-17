"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "@/shared/lib/errors";
import { uuidv7 } from "@/shared/lib/ids";
import { moneyFromMajor, toMajor } from "@/shared/lib/money";
import { Button, IconButton } from "@/shared/ui/button";
import { Input } from "@/shared/ui/field";
import { Sheet } from "@/shared/ui/sheet";

import { MAX_OPTIONS_PER_GROUP, MAX_OPTION_GROUPS } from "../../domain/menu-options";
import type { MenuItem, OptionGroup } from "../../domain/types";
import { setMenuItemOptions } from "../../offline/repository";
import { useRestaurant } from "../restaurant-provider";

type DraftOption = { id: string; name: string; supplement: string };
type DraftGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  isMultiple: boolean;
  options: DraftOption[];
};

function toDraft(groups: readonly OptionGroup[]): DraftGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    isRequired: group.isRequired,
    isMultiple: group.isMultiple,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      supplement: option.priceDelta.amountMinor > 0 ? String(toMajor(option.priceDelta)) : "",
    })),
  }));
}

const emptyOption = (): DraftOption => ({ id: uuidv7(), name: "", supplement: "" });

/**
 * Options d'un élément, fixées par le gérant (D-035, D-060) : groupes
 * (« Préparation », « Suppléments »), obligatoires ou non, à choix unique ou
 * multiple, avec un supplément facultatif par option.
 */
export function OptionGroupsEditorSheet({
  item,
  onClose,
}: {
  item: MenuItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={item ? `Options · ${item.name}` : ""}
      description="Les commandes déjà passées gardent les options choisies à l'époque."
    >
      {item ? <Editor key={item.id} item={item} onDone={onClose} /> : null}
    </Sheet>
  );
}

function Editor({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const { db, ctx } = useRestaurant();
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(item.optionGroups ?? []));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function update(groupId: string, change: (group: DraftGroup) => DraftGroup) {
    setGroups((current) => current.map((group) => (group.id === groupId ? change(group) : group)));
    setError(null);
  }

  async function save() {
    const parsed: OptionGroup[] = [];
    for (const group of groups) {
      const options = [];
      for (const option of group.options) {
        if (option.name.trim() === "" && option.supplement.trim() === "") continue;
        const text = option.supplement.replace(/\s/g, "");
        const major = text === "" ? 0 : Number(text);
        if (!Number.isInteger(major) || major < 0) {
          setError(
            `Le supplément de « ${option.name || "l'option"} » doit être un nombre entier de francs.`,
          );
          return;
        }
        options.push({
          id: option.id,
          name: option.name,
          priceDelta: moneyFromMajor(major, ctx.settings.currency),
        });
      }
      parsed.push({
        id: group.id,
        name: group.name,
        isRequired: group.isRequired,
        isMultiple: group.isMultiple,
        options,
      });
    }
    setIsSaving(true);
    try {
      await setMenuItemOptions(db, ctx, item.id, parsed);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <p className="text-sm text-text-muted">
          Aucune option : l&apos;élément s&apos;ajoute d&apos;un seul appui à la commande.
        </p>
      ) : null}
      {groups.map((group, groupIndex) => (
        <fieldset key={group.id} className="flex flex-col gap-3 rounded-lg bg-bg-subtle p-3">
          <legend className="sr-only">Groupe {groupIndex + 1}</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Input
              aria-label={`Nom du groupe ${groupIndex + 1}`}
              placeholder="Nom du groupe (ex. Préparation)"
              value={group.name}
              onChange={(event) => update(group.id, (g) => ({ ...g, name: event.target.value }))}
            />
            <IconButton
              label={`Supprimer le groupe ${group.name || groupIndex + 1}`}
              variant="ghost"
              size="sm"
              onClick={() => setGroups((current) => current.filter((g) => g.id !== group.id))}
            >
              <Trash2 />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={group.isRequired}
                onChange={(event) =>
                  update(group.id, (g) => ({ ...g, isRequired: event.target.checked }))
                }
                className="size-5 accent-action"
              />
              Obligatoire
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={group.isMultiple}
                onChange={(event) =>
                  update(group.id, (g) => ({ ...g, isMultiple: event.target.checked }))
                }
                className="size-5 accent-action"
              />
              Plusieurs choix possibles
            </label>
          </div>
          <ul className="flex flex-col gap-2">
            {group.options.map((option, optionIndex) => (
              <li
                key={option.id}
                className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2"
              >
                <Input
                  aria-label={`Option ${optionIndex + 1} du groupe ${group.name || groupIndex + 1}`}
                  placeholder="Option (ex. Grillé)"
                  value={option.name}
                  onChange={(event) =>
                    update(group.id, (g) => ({
                      ...g,
                      options: g.options.map((o) =>
                        o.id === option.id ? { ...o, name: event.target.value } : o,
                      ),
                    }))
                  }
                />
                <Input
                  aria-label={`Supplément en francs, option ${optionIndex + 1}`}
                  placeholder="+ FC"
                  inputMode="numeric"
                  value={option.supplement}
                  onChange={(event) =>
                    update(group.id, (g) => ({
                      ...g,
                      options: g.options.map((o) =>
                        o.id === option.id ? { ...o, supplement: event.target.value } : o,
                      ),
                    }))
                  }
                  className="tabular"
                />
                <IconButton
                  label={`Supprimer l'option ${option.name || optionIndex + 1}`}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update(group.id, (g) => ({
                      ...g,
                      options: g.options.filter((o) => o.id !== option.id),
                    }))
                  }
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
          {group.options.length < MAX_OPTIONS_PER_GROUP ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                update(group.id, (g) => ({ ...g, options: [...g.options, emptyOption()] }))
              }
            >
              <Plus aria-hidden />
              Ajouter une option
            </Button>
          ) : null}
        </fieldset>
      ))}
      {groups.length < MAX_OPTION_GROUPS ? (
        <Button
          variant="outline"
          onClick={() =>
            setGroups((current) => [
              ...current,
              {
                id: uuidv7(),
                name: "",
                isRequired: false,
                isMultiple: false,
                options: [emptyOption(), emptyOption()],
              },
            ])
          }
        >
          <Plus aria-hidden />
          Ajouter un groupe d&apos;options
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <Button variant="action" size="lg" disabled={isSaving} onClick={() => void save()}>
        <Save aria-hidden />
        {isSaving ? "Enregistrement…" : "Enregistrer les options"}
      </Button>
    </div>
  );
}
