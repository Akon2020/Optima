import { addMoney, moneyFromMinor, zero, type Currency, type Money } from "@/shared/lib/money";

import { maxOrderableQuantity, type Availability } from "./menu";
import type { MenuItem, OptionGroup, OrderLine } from "./types";

/**
 * Éléments avec options et formules (D-035, D-060).
 *
 * - Une option ajoute un supplément (jamais négatif) au prix de l'élément ;
 *   elle ne touche pas le stock (HYPOTHÈSE D-Q33 : l'effet d'un
 *   accompagnement inclus sur le stock n'est pas tranché).
 * - Une formule a son propre prix ; commandée, chaque composant part à son
 *   point de service et compte dans son stock. Le prix de la formule est
 *   réparti entre les composants au prorata de leur prix au menu, en francs
 *   entiers, pour que chaque caisse reçoive sa part (D-007).
 */

export const MAX_OPTION_GROUPS = 6;
export const MAX_OPTIONS_PER_GROUP = 12;
export const MIN_FORMULA_COMPONENTS = 2;
export const MAX_FORMULA_COMPONENTS = 8;

export type MenuIssue = { code: string; message: string };

export function isFormula(item: Pick<MenuItem, "kind">): boolean {
  return item.kind === "formula";
}

/** Contrôle des groupes d'options saisis par le gérant. */
export function optionGroupsIssue(groups: readonly OptionGroup[]): MenuIssue | null {
  if (groups.length > MAX_OPTION_GROUPS) {
    return {
      code: "TOO_MANY_GROUPS",
      message: `${MAX_OPTION_GROUPS} groupes d'options au plus par élément.`,
    };
  }
  for (const group of groups) {
    if (group.name.trim().length < 2) {
      return { code: "GROUP_NAME_REQUIRED", message: "Donnez un nom à chaque groupe d'options." };
    }
    if (group.options.length === 0) {
      return {
        code: "OPTIONS_REQUIRED",
        message: `Le groupe « ${group.name} » doit proposer au moins une option.`,
      };
    }
    if (group.options.length > MAX_OPTIONS_PER_GROUP) {
      return {
        code: "TOO_MANY_OPTIONS",
        message: `${MAX_OPTIONS_PER_GROUP} options au plus dans « ${group.name} ».`,
      };
    }
    for (const option of group.options) {
      if (option.name.trim().length < 1) {
        return { code: "OPTION_NAME_REQUIRED", message: "Donnez un nom à chaque option." };
      }
      if (option.priceDelta.amountMinor < 0 || option.priceDelta.amountMinor % 100 !== 0) {
        return {
          code: "INVALID_SUPPLEMENT",
          message: `Le supplément de « ${option.name} » doit être un nombre entier de francs, positif ou nul.`,
        };
      }
    }
  }
  return null;
}

/** Contrôle des options choisies à la commande (obligatoire, choix unique). */
export function optionChoiceIssue(
  item: Pick<MenuItem, "name" | "optionGroups">,
  optionIds: readonly string[],
): MenuIssue | null {
  const groups = item.optionGroups ?? [];
  const known = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  if (optionIds.some((id) => !known.has(id))) {
    return {
      code: "UNKNOWN_OPTION",
      message: `Une option de « ${item.name} » n'existe plus : choisissez à nouveau.`,
    };
  }
  for (const group of groups) {
    const chosen = group.options.filter((option) => optionIds.includes(option.id)).length;
    if (group.isRequired && chosen === 0) {
      return {
        code: "OPTION_REQUIRED",
        message: `Choisissez « ${group.name} » pour « ${item.name} ».`,
      };
    }
    if (!group.isMultiple && chosen > 1) {
      return {
        code: "SINGLE_OPTION",
        message: `Une seule option possible pour « ${group.name} ».`,
      };
    }
  }
  return null;
}

/** Options choisies et prix unitaire qui en résulte (supplément compris). */
export function priceWithOptions(
  item: Pick<MenuItem, "price" | "optionGroups">,
  optionIds: readonly string[],
): { unitPrice: Money | null; options: NonNullable<OrderLine["options"]> } {
  const options = (item.optionGroups ?? []).flatMap((group) =>
    group.options
      .filter((option) => optionIds.includes(option.id))
      .map((option) => ({
        groupName: group.name,
        name: option.name,
        priceDelta: option.priceDelta,
      })),
  );
  if (!item.price) return { unitPrice: null, options };
  return {
    unitPrice: options.reduce((sum, option) => addMoney(sum, option.priceDelta), item.price),
    options,
  };
}

/** Contrôle des composants d'une formule. */
export function formulaIssue(
  components: readonly string[],
  itemById: ReadonlyMap<string, MenuItem>,
): MenuIssue | null {
  if (components.length < MIN_FORMULA_COMPONENTS || components.length > MAX_FORMULA_COMPONENTS) {
    return {
      code: "FORMULA_SIZE",
      message: `Une formule compte de ${MIN_FORMULA_COMPONENTS} à ${MAX_FORMULA_COMPONENTS} éléments.`,
    };
  }
  for (const id of components) {
    const component = itemById.get(id);
    if (!component || component.archivedAt !== null) {
      return {
        code: "COMPONENT_NOT_FOUND",
        message: "Un élément de la formule n'existe plus au menu.",
      };
    }
    if (isFormula(component)) {
      return {
        code: "NESTED_FORMULA",
        message: "Une formule ne peut pas contenir une autre formule.",
      };
    }
    if (!component.price) {
      return {
        code: "COMPONENT_PRICE_NOT_SET",
        message: `« ${component.name} » n'a pas de prix : fixez-le avant de l'inclure dans une formule.`,
      };
    }
  }
  return null;
}

/**
 * Part du prix d'une formule revenant à chaque composant, au prorata de son
 * prix au menu (le plus grand reste d'abord). Les parts sont des multiples de
 * 100 FC quand les prix le sont (D-042), sinon des francs entiers.
 */
export function splitFormulaPrice(price: Money, componentPrices: readonly Money[]): Money[] {
  const unit =
    [10_000, 100].find(
      (step) =>
        price.amountMinor % step === 0 &&
        componentPrices.every((value) => value.amountMinor % step === 0),
    ) ?? 1;
  const weights = componentPrices.map((value) => value.amountMinor);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const target = price.amountMinor / unit;
  if (totalWeight <= 0) {
    // Composants sans valeur : parts égales.
    const even = Math.floor(target / weights.length);
    return weights.map((_, index) =>
      moneyFromMinor(
        (even + (index < target - even * weights.length ? 1 : 0)) * unit,
        price.currency,
      ),
    );
  }
  const shares = weights.map((weight, index) => {
    const exact = (target * weight) / totalWeight;
    return { index, units: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let left = target - shares.reduce((sum, share) => sum + share.units, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction)) {
    if (left <= 0) break;
    share.units += 1;
    left -= 1;
  }
  return shares.map((share) => moneyFromMinor(share.units * unit, price.currency));
}

export type RequestedLine = {
  menuItemId: string;
  quantity: number;
  optionIds?: string[] | undefined;
};

/**
 * Transforme une ligne commandée en lignes de facture (EF-CMD-02, D-060) :
 * une ligne pour un élément (options comprises), une par composant pour une
 * formule. Le prix est relu au menu, jamais repris de l'écran (CLAUDE.md § 3.9).
 *
 * `lenient` sert à la synchronisation : une vente faite hors connexion n'est
 * pas refusée parce que le gérant a, entre-temps, archivé l'élément ou changé
 * ses options (RG-STK-03, RG-OFF-03) ; seules les options encore connues sont
 * facturées.
 */
export function expandOrderLine(
  requested: RequestedLine,
  itemById: ReadonlyMap<string, MenuItem>,
  lineId: string,
  { lenient = false }: { lenient?: boolean } = {},
): { ok: true; lines: OrderLine[] } | ({ ok: false } & MenuIssue) {
  const item = itemById.get(requested.menuItemId);
  if (!item || (!lenient && item.archivedAt !== null)) {
    return {
      ok: false,
      code: "ITEM_NOT_FOUND",
      message: "Un élément de la commande n'existe plus au menu.",
    };
  }
  if (!item.price) {
    return {
      ok: false,
      code: "PRICE_NOT_SET",
      message: `« ${item.name} » n'a pas de prix : demandez au gérant de le fixer.`,
    };
  }
  if (isFormula(item)) {
    const components = item.components ?? [];
    const issue = formulaIssue(
      components,
      lenient
        ? new Map([...itemById].map(([id, entry]) => [id, { ...entry, archivedAt: null }]))
        : itemById,
    );
    if (issue) return { ok: false, ...issue };
    const parts = components.map((id) => itemById.get(id) as MenuItem);
    const shares = splitFormulaPrice(
      item.price,
      parts.map((part) => part.price ?? zero(item.price?.currency ?? "CDF")),
    );
    return {
      ok: true,
      lines: parts.map((part, index) => ({
        menuItemId: part.id,
        name: part.name,
        servicePointId: part.servicePointId,
        unit: part.unit,
        unitPrice: shares[index] ?? zero(item.price?.currency ?? "CDF"),
        quantity: requested.quantity,
        formula: { menuItemId: item.id, name: item.name, lineId },
      })),
    };
  }
  const optionIds = requested.optionIds ?? [];
  const issue = lenient ? null : optionChoiceIssue(item, optionIds);
  if (issue) return { ok: false, ...issue };
  const priced = priceWithOptions(item, optionIds);
  return {
    ok: true,
    lines: [
      {
        menuItemId: item.id,
        name: item.name,
        servicePointId: item.servicePointId,
        unit: item.unit,
        unitPrice: priced.unitPrice ?? item.price,
        quantity: requested.quantity,
        ...(priced.options.length > 0 ? { options: priced.options } : {}),
      },
    ],
  };
}

/** Prix affiché d'une ligne du panier (options comprises, ou prix de la formule). */
export function cartLinePrice(
  item: Pick<MenuItem, "price" | "optionGroups" | "kind">,
  optionIds: readonly string[],
  currency: Currency,
): Money {
  if (isFormula(item)) return item.price ?? zero(currency);
  return priceWithOptions(item, optionIds).unitPrice ?? zero(currency);
}

/** Disponibilité affichée d'une formule, déduite de celle de ses composants. */
export function formulaAvailability(
  formula: Pick<MenuItem, "price" | "components">,
  availabilityById: ReadonlyMap<string, Availability>,
  lowStockThreshold: number,
): Availability {
  if (!formula.price) return { status: "no-price" };
  const max = formulaMaxQuantity(formula.components ?? [], availabilityById);
  if (max === null) return { status: "unknown-stock" };
  if (max <= 0) return { status: "sold-out", remaining: max };
  if (max <= lowStockThreshold) return { status: "low", remaining: max };
  return { status: "available", remaining: max };
}

/**
 * Disponibilité d'une formule : le composant le plus rare la limite (un
 * composant présent deux fois compte double).
 */
export function formulaMaxQuantity(
  components: readonly string[],
  availabilityById: ReadonlyMap<string, Availability>,
): number | null {
  let max: number | null = null;
  const counts = new Map<string, number>();
  for (const id of components) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    const availability = availabilityById.get(id);
    if (!availability) return 0;
    if (availability.status === "no-price" || availability.status === "sold-out") return 0;
    const componentMax = maxOrderableQuantity(availability);
    if (componentMax === null) continue;
    const possible = Math.floor(componentMax / count);
    max = max === null ? possible : Math.min(max, possible);
  }
  return max;
}
