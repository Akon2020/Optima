import { multiplyMoney, sumMoney, type Currency, type Money } from "@/shared/lib/money";

import type { OrderLine, ServicePoint } from "./types";

export function lineTotal(line: Pick<OrderLine, "unitPrice" | "quantity">): Money {
  return multiplyMoney(line.unitPrice, line.quantity);
}

export function linesTotal(lines: readonly OrderLine[], currency: Currency): Money {
  return sumMoney(
    lines.map((line) => lineTotal(line)),
    currency,
  );
}

export type ServicePointSplit = {
  servicePointId: string;
  lines: OrderLine[];
  total: Money;
};

/**
 * Répartit une commande par point de service (EF-CMD-02) : une facture
 * d'avance par point concerné (boissons au comptoir, plats en cuisine, chèvre
 * à la grillade). Les points sans ligne sont omis ; l'ordre suit celui des
 * points de service, puis l'ordre de saisie des lignes.
 */
export function splitOrderByServicePoint(
  lines: readonly OrderLine[],
  servicePoints: readonly Pick<ServicePoint, "id" | "sortOrder">[],
  currency: Currency,
): ServicePointSplit[] {
  const order = new Map(servicePoints.map((point) => [point.id, point.sortOrder]));
  const groups = new Map<string, OrderLine[]>();

  for (const line of lines) {
    if (!order.has(line.servicePointId)) {
      throw new Error(`Point de service inconnu pour « ${line.name} ».`);
    }
    const group = groups.get(line.servicePointId) ?? [];
    group.push(line);
    groups.set(line.servicePointId, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([servicePointId, groupLines]) => ({
      servicePointId,
      lines: groupLines,
      total: linesTotal(groupLines, currency),
    }));
}

export type CartIssue =
  { code: "EMPTY_CART" } | { code: "INVALID_QUANTITY"; name: string } | { code: "TABLE_REQUIRED" };

/** Contrôles avant validation d'une commande (messages en français à l'affichage). */
export function validateCart(input: {
  lines: readonly Pick<OrderLine, "name" | "quantity">[];
  mode: "dine-in" | "takeaway" | "delivery";
  tableId: string | null;
}): CartIssue[] {
  const issues: CartIssue[] = [];
  if (input.lines.length === 0) issues.push({ code: "EMPTY_CART" });
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      issues.push({ code: "INVALID_QUANTITY", name: line.name });
    }
  }
  if (input.mode === "dine-in" && input.tableId === null) issues.push({ code: "TABLE_REQUIRED" });
  return issues;
}

export const CART_ISSUE_MESSAGES: Record<CartIssue["code"], string> = {
  EMPTY_CART: "Ajoutez au moins un élément à la commande.",
  INVALID_QUANTITY: "Une quantité n'est pas valide : elle doit être un nombre entier positif.",
  TABLE_REQUIRED: "Choisissez la table avant de valider la commande.",
};
