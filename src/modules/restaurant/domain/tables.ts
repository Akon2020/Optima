import { addMoney, multiplyMoney, zero, type Currency, type Money } from "@/shared/lib/money";

import { orderPrepStatus } from "./dashboard";
import { normalizeSearch } from "./menu";
import type {
  AdvanceInvoice,
  DiningTable,
  Order,
  PrepStatus,
  SaleUnit,
  TableRelease,
} from "./types";

/**
 * Occupation des tables (EF-RES-04, EF-CMD-04, EF-CMD-05).
 *
 * Une table est occupée dès qu'une commande y est passée pendant la journée
 * d'exploitation, après sa dernière libération. Les commandes suivantes sur
 * la même table sont des commandes complémentaires de la même occupation.
 *
 * HYPOTHÈSE D-Q04 : tant que l'encaissement n'est pas tranché, la table est
 * libérée à la main par le serveur ou le gérant. Quand il le sera, la
 * libération suivra le règlement de toutes les factures de l'occupation.
 */
export type TableSession = {
  tableId: string;
  openedAt: string;
  orders: Order[];
  invoices: AdvanceInvoice[];
  total: Money;
  prepStatus: PrepStatus;
  waiterNames: string[];
};

export function tableSessions(input: {
  orders: readonly Order[];
  invoices: readonly AdvanceInvoice[];
  releases: readonly TableRelease[];
  dayStart: string;
  currency: Currency;
}): Map<string, TableSession> {
  const lastRelease = new Map<string, string>();
  for (const release of input.releases) {
    const current = lastRelease.get(release.tableId);
    if (!current || release.releasedAt > current)
      lastRelease.set(release.tableId, release.releasedAt);
  }
  const invoicesByOrder = new Map<string, AdvanceInvoice[]>();
  for (const invoice of input.invoices) {
    invoicesByOrder.set(invoice.orderId, [
      ...(invoicesByOrder.get(invoice.orderId) ?? []),
      invoice,
    ]);
  }

  const sessions = new Map<string, TableSession>();
  const sorted = [...input.orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const order of sorted) {
    if (order.tableId === null || order.createdAt < input.dayStart) continue;
    const released = lastRelease.get(order.tableId);
    if (released && order.createdAt <= released) continue;
    const active = (invoicesByOrder.get(order.id) ?? []).filter(
      (invoice) => invoice.paymentStatus !== "cancelled",
    );
    if (active.length === 0) continue;

    const session = sessions.get(order.tableId) ?? {
      tableId: order.tableId,
      openedAt: order.createdAt,
      orders: [],
      invoices: [],
      total: zero(input.currency),
      prepStatus: "served" as PrepStatus,
      waiterNames: [],
    };
    session.orders.push(order);
    session.invoices.push(...active);
    for (const invoice of active) session.total = addMoney(session.total, invoice.total);
    if (!session.waiterNames.includes(order.waiterName)) session.waiterNames.push(order.waiterName);
    sessions.set(order.tableId, session);
  }
  for (const session of sessions.values()) {
    session.prepStatus = orderPrepStatus(session.invoices.map((invoice) => invoice.prepStatus));
  }
  return sessions;
}

export type BillLine = {
  menuItemId: string;
  name: string;
  unit: SaleUnit;
  unitPrice: Money;
  quantity: number;
  total: Money;
};

/**
 * Addition récapitulative (EF-CMD-05) : toutes les factures de l'occupation,
 * lignes regroupées par élément et par prix. Un changement de prix entre deux
 * commandes donne deux lignes distinctes (RG-RES-02 : le prix facturé est figé).
 */
export function buildTableBill(session: TableSession): { lines: BillLine[]; total: Money } {
  const lines = new Map<string, BillLine>();
  for (const invoice of session.invoices) {
    for (const line of invoice.lines) {
      const key = `${line.menuItemId}:${line.unitPrice.amountMinor}`;
      const existing = lines.get(key);
      const quantity = (existing?.quantity ?? 0) + line.quantity;
      lines.set(key, {
        menuItemId: line.menuItemId,
        name: line.name,
        unit: line.unit,
        unitPrice: line.unitPrice,
        quantity,
        total: multiplyMoney(line.unitPrice, quantity),
      });
    }
  }
  return { lines: [...lines.values()], total: session.total };
}

/** Prochain libellé proposé : « Table N » après le plus grand numéro existant. */
export function nextTableLabel(tables: readonly Pick<DiningTable, "label">[]): string {
  const numbers = tables
    .map((table) => /(\d+)\s*$/.exec(table.label)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  return `Table ${numbers.length === 0 ? 1 : Math.max(...numbers) + 1}`;
}

export const MAX_TABLE_LABEL_LENGTH = 24;

/** Contrôle d'un libellé de table ; renvoie le message d'erreur ou `null`. */
export function validateTableLabel(
  label: string,
  tables: readonly { id: string; label: string; archivedAt: DiningTable["archivedAt"] | Date }[],
  excludeId: string | null = null,
): string | null {
  const trimmed = label.trim();
  if (trimmed.length === 0) return "Donnez un nom à la table (par exemple « Table 13 »).";
  if (trimmed.length > MAX_TABLE_LABEL_LENGTH) {
    return `Le nom ne doit pas dépasser ${MAX_TABLE_LABEL_LENGTH} caractères.`;
  }
  const key = normalizeSearch(trimmed);
  const duplicate = tables.some(
    (table) =>
      table.id !== excludeId && table.archivedAt === null && normalizeSearch(table.label) === key,
  );
  return duplicate ? `Une table s'appelle déjà « ${trimmed} ».` : null;
}

/** Libellé court pour les tuiles : « Table 12 » devient « 12 ». */
export function shortTableLabel(label: string): string {
  return label.replace(/^table\s+/i, "");
}
