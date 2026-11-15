"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useSyncExternalStore } from "react";

import { businessDayKey, businessDayStart } from "../domain/business-day";
import { computeAvailability, type Availability } from "../domain/menu";
import { customerDebts, type CustomerDebt } from "../domain/customers";
import { currentEntries } from "../domain/morning-stock";
import { invoiceBalances, type InvoiceBalance } from "../domain/payment";
import { tableSessions, type TableSession } from "../domain/tables";
import type {
  AdjustmentDecision,
  AdjustmentRequest,
  AdvanceInvoice,
  Customer,
  DiningTable,
  ExchangeRate,
  MenuItem,
  MorningStockEntry,
  Order,
  Payment,
  ServicePoint,
  StaffMember,
  StockCountLine,
  TableRelease,
} from "../domain/types";
import { useRestaurant } from "../components/restaurant-provider";
import {
  cashClosingDraft,
  dayClosingStatus,
  morningProposals,
  stockCountDraft,
  type CashClosingDraft,
  type DayClosingStatus,
} from "./repository";

const CLOCK_INTERVAL_MS = 30_000;
let clock: string | null = null;
let clockTimer: number | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockTimer = window.setInterval(() => {
      clock = new Date().toISOString();
      clockListeners.forEach((notify) => notify());
    }, CLOCK_INTERVAL_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

function readClock(): string {
  clock ??= new Date().toISOString();
  return clock;
}

/**
 * Instant courant, rafraîchi toutes les 30 secondes (temps écoulé, journée en
 * cours). `null` pendant le rendu serveur : l'heure n'est lue que sur
 * l'appareil, jamais figée au prérendu.
 */
export function useNow(): string | null {
  return useSyncExternalStore(subscribeClock, readClock, () => null);
}

export type DayData = {
  now: string;
  day: string;
  dayStart: string;
  servicePoints: ServicePoint[];
  menuItems: MenuItem[];
  /** Toutes les tables, archivées comprises (les écrans filtrent `archivedAt`). */
  tables: DiningTable[];
  releases: TableRelease[];
  /** Occupation en cours par table (EF-CMD-04). */
  sessions: Map<string, TableSession>;
  staff: StaffMember[];
  orders: Order[];
  invoices: AdvanceInvoice[];
  /** Toutes les saisies du stock du matin de la journée (historique compris). */
  morningEntries: MorningStockEntry[];
  /** Saisie en vigueur par élément. */
  morningStock: Map<string, MorningStockEntry>;
  availability: Map<string, Availability>;
  soldByItem: Map<string, number>;
  /** Paiements de la journée (EF-ENC-02), tous appareils confondus après synchronisation. */
  payments: Payment[];
  /** Soldes des factures de la journée, déduits des paiements. */
  balances: Map<string, InvoiceBalance>;
  /** Dernier taux du dollar saisi (D-042), `null` s'il n'y en a pas encore. */
  exchangeRate: ExchangeRate | null;
  /** Demandes d'annulation ou de remise et décisions du gérant (D-058). */
  adjustmentRequests: AdjustmentRequest[];
  adjustmentDecisions: AdjustmentDecision[];
  /** Fiches clients de la vente à crédit (D-059). */
  customers: Customer[];
};

/**
 * Données de la journée d'exploitation, lues en direct dans la base locale
 * (CLAUDE.md § 3.5 : IndexedDB comme source, `useLiveQuery`).
 */
export function useDayData(): DayData | undefined {
  const { db, ctx, status } = useRestaurant();
  const now = useNow();
  const { businessDayStartHour, timeZone, lowStockThreshold, currency } = ctx.settings;
  const dayStart = now ? businessDayStart(now, businessDayStartHour, timeZone) : null;
  const day = now ? businessDayKey(now, businessDayStartHour, timeZone) : null;

  const raw = useLiveQuery(async () => {
    if (status !== "ready" || dayStart === null || day === null) return undefined;
    const [
      servicePoints,
      menuItems,
      tables,
      staff,
      orders,
      invoices,
      morningEntries,
      releases,
      payments,
      exchangeRate,
      adjustmentRequests,
      adjustmentDecisions,
      customers,
    ] = await Promise.all([
      db.servicePoints.orderBy("sortOrder").toArray(),
      db.menuItems.toArray(),
      db.diningTables.orderBy("sortOrder").toArray(),
      db.staff.toArray(),
      db.orders.where("createdAt").aboveOrEqual(dayStart).reverse().sortBy("createdAt"),
      db.invoices.where("createdAt").aboveOrEqual(dayStart).toArray(),
      db.morningStockEntries.where("day").equals(day).toArray(),
      db.tableReleases.where("releasedAt").aboveOrEqual(dayStart).toArray(),
      db.payments.where("createdAt").aboveOrEqual(dayStart).sortBy("createdAt"),
      db.exchangeRates.orderBy("effectiveAt").last(),
      // Peu nombreuses : toutes, pour qu'une demande ancienne en attente reste visible.
      db.adjustmentRequests.orderBy("requestedAt").toArray(),
      db.adjustmentDecisions.toArray(),
      db.customers.toArray(),
    ]);
    return {
      servicePoints,
      menuItems,
      tables,
      staff,
      orders,
      invoices,
      morningEntries,
      releases,
      payments,
      exchangeRate: exchangeRate ?? null,
      adjustmentRequests,
      adjustmentDecisions,
      customers,
    };
  }, [db, status, dayStart, day]);

  return useMemo(() => {
    if (!raw || now === null || dayStart === null || day === null) return undefined;
    const soldByItem = new Map<string, number>();
    for (const invoice of raw.invoices) {
      if (invoice.paymentStatus === "cancelled") continue;
      for (const line of invoice.lines) {
        soldByItem.set(line.menuItemId, (soldByItem.get(line.menuItemId) ?? 0) + line.quantity);
      }
    }
    const morningStock = currentEntries(raw.morningEntries);
    const availability = new Map<string, Availability>(
      raw.menuItems.map((item) => [
        item.id,
        computeAvailability(
          item,
          morningStock.get(item.id)?.quantity ?? null,
          soldByItem.get(item.id) ?? 0,
          lowStockThreshold,
        ),
      ]),
    );
    const sessions = tableSessions({
      orders: raw.orders,
      invoices: raw.invoices,
      releases: raw.releases,
      dayStart,
      currency,
    });
    const balances = invoiceBalances(raw.invoices, raw.payments);
    return {
      ...raw,
      now,
      day,
      dayStart,
      availability,
      soldByItem,
      morningStock,
      sessions,
      balances,
    };
  }, [raw, now, day, dayStart, lowStockThreshold, currency]);
}

/** Propositions du stock du matin de la journée, par élément (EF-REQ-04). */
export function useMorningProposals(
  dayStart: string | null,
): Map<string, number | null> | undefined {
  const { db, ctx, status } = useRestaurant();
  return useLiveQuery(
    () =>
      status === "ready" && dayStart !== null ? morningProposals(db, ctx, dayStart) : undefined,
    [db, ctx, status, dayStart],
  );
}

/** Nombre d'opérations en attente d'envoi au serveur (EF-OFF-02). */
export function usePendingOperations(): number {
  const { db, status } = useRestaurant();
  return (
    useLiveQuery(
      () => (status === "ready" ? db.outbox.where("status").equals("pending").count() : 0),
      [db, status],
    ) ?? 0
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** État du réseau de l'appareil. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type ClosingData = {
  status: DayClosingStatus;
  /** Ce que la personne active doit déclarer (EF-CLO-01). */
  myDraft: CashClosingDraft;
  /** Lignes à compter de chaque point de service (EF-CLO-03). */
  stockDrafts: Map<string, Omit<StockCountLine, "counted" | "declaredOut" | "outReason">[]>;
  pendingOperations: number;
};

/** Clôture de la journée en cours, lue en direct dans la base locale (EF-CLO-01 à 04). */
export function useClosingData(): ClosingData | undefined {
  const { db, ctx, status } = useRestaurant();
  const now = useNow();
  return useLiveQuery(async () => {
    if (status !== "ready" || now === null) return undefined;
    const [dayStatus, myDraft, pendingOperations, points] = await Promise.all([
      dayClosingStatus(db, ctx, now),
      cashClosingDraft(db, ctx, now),
      db.outbox.where("status").equals("pending").count(),
      db.servicePoints.orderBy("sortOrder").toArray(),
    ]);
    const stockDrafts = new Map(
      await Promise.all(
        points.map(
          async (point) =>
            [point.id, await stockCountDraft(db, ctx, point.id, dayStatus.day)] as const,
        ),
      ),
    );
    return { status: dayStatus, myDraft, stockDrafts, pendingOperations };
  }, [db, ctx, status, now]);
}

export type CustomersData = {
  now: string;
  customers: Customer[];
  /** Dettes nées des ventes à crédit validées (D-059), réglées comprises. */
  debts: CustomerDebt[];
  orders: Map<string, Order>;
  invoices: AdvanceInvoice[];
  balances: Map<string, InvoiceBalance>;
};

/**
 * Clients et dettes (EF-TRE-03) : les factures d'une dette peuvent dater de
 * plusieurs semaines, elles sont donc lues hors de la journée en cours.
 */
export function useCustomersData(): CustomersData | undefined {
  const { db, ctx, status } = useRestaurant();
  const now = useNow();
  const currency = ctx.settings.currency;
  return useLiveQuery(async () => {
    if (status !== "ready" || now === null) return undefined;
    const [customers, requests, decisions] = await Promise.all([
      db.customers.toArray(),
      db.adjustmentRequests.toArray(),
      db.adjustmentDecisions.toArray(),
    ]);
    const credits = requests.filter((request) => request.kind === "credit");
    const orderIds = [...new Set(credits.map((request) => request.orderId))];
    const [orders, invoices] = orderIds.length
      ? await Promise.all([
          db.orders.bulkGet(orderIds),
          db.invoices.where("orderId").anyOf(orderIds).toArray(),
        ])
      : [[], []];
    const since = invoices.map((invoice) => invoice.createdAt).sort()[0];
    const payments = since
      ? await db.payments.where("createdAt").aboveOrEqual(since).toArray()
      : [];
    const balances = invoiceBalances(invoices, payments);
    return {
      now,
      customers: customers.sort((a, b) => a.name.localeCompare(b.name, "fr")),
      debts: customerDebts({ requests: credits, decisions, invoices, balances, currency }),
      orders: new Map(
        orders.filter((order) => order !== undefined).map((order) => [order.id, order]),
      ),
      invoices,
      balances,
    };
  }, [db, status, now, currency]);
}
