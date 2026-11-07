"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useSyncExternalStore } from "react";

import { businessDayKey, businessDayStart } from "../domain/business-day";
import { computeAvailability, type Availability } from "../domain/menu";
import type {
  AdvanceInvoice,
  DiningTable,
  MenuItem,
  MorningStock,
  Order,
  ServicePoint,
  StaffMember,
} from "../domain/types";
import { useRestaurant } from "../components/restaurant-provider";

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
  tables: DiningTable[];
  staff: StaffMember[];
  orders: Order[];
  invoices: AdvanceInvoice[];
  morningStock: MorningStock[];
  availability: Map<string, Availability>;
  soldByItem: Map<string, number>;
};

/**
 * Données de la journée d'exploitation, lues en direct dans la base locale
 * (CLAUDE.md § 3.5 : IndexedDB comme source, `useLiveQuery`).
 */
export function useDayData(): DayData | undefined {
  const { db, ctx, status } = useRestaurant();
  const now = useNow();
  const { businessDayStartHour, timeZone, lowStockThreshold } = ctx.settings;
  const dayStart = now ? businessDayStart(now, businessDayStartHour, timeZone) : null;
  const day = now ? businessDayKey(now, businessDayStartHour, timeZone) : null;

  const raw = useLiveQuery(async () => {
    if (status !== "ready" || dayStart === null || day === null) return undefined;
    const [servicePoints, menuItems, tables, staff, orders, invoices, morningStock] =
      await Promise.all([
        db.servicePoints.orderBy("sortOrder").toArray(),
        db.menuItems.toArray(),
        db.diningTables.orderBy("sortOrder").toArray(),
        db.staff.toArray(),
        db.orders.where("createdAt").aboveOrEqual(dayStart).reverse().sortBy("createdAt"),
        db.invoices.where("createdAt").aboveOrEqual(dayStart).toArray(),
        db.morningStock.where("day").equals(day).toArray(),
      ]);
    return { servicePoints, menuItems, tables, staff, orders, invoices, morningStock };
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
    const morningByItem = new Map(
      raw.morningStock.map((entry) => [entry.menuItemId, entry.quantity]),
    );
    const availability = new Map<string, Availability>(
      raw.menuItems.map((item) => [
        item.id,
        computeAvailability(
          item,
          morningByItem.get(item.id) ?? null,
          soldByItem.get(item.id) ?? 0,
          lowStockThreshold,
        ),
      ]),
    );
    return { ...raw, now, day, dayStart, availability, soldByItem };
  }, [raw, now, day, dayStart, lowStockThreshold]);
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
