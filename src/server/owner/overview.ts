import type { Currency } from "@/shared/lib/money";

import {
  periodRange,
  summarizeEstablishment,
  totalsByCurrency,
  type EstablishmentSales,
  type OverviewPeriod,
} from "@/modules/owner";
import { businessDayKey } from "@/modules/restaurant";

import { requireOwner, type Actor } from "../authz/authorize";
import type { Db } from "../db/context";
import { toSafeNumber, withContext } from "../db/context";

/**
 * Vue d'ensemble du propriétaire (EF-PRO-01, EF-PRO-02, EF-PRO-04,
 * EF-PRO-05) : lecture consolidée par le drapeau RLS du propriétaire (D-022),
 * posé seulement après `requireOwner`.
 */

/** EF-PRO-05 : un appareil sans nouvelles depuis 24 heures est signalé. */
const STALE_DEVICE_MS = 24 * 60 * 60 * 1000;
/** Refus de synchronisation pris en compte dans les alertes. */
const REJECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type OwnerAlert = {
  establishmentId: string;
  establishmentName: string;
  kind: "suspended" | "device-stale" | "rejected-operations" | "morning-stock";
  message: string;
  href: string;
};

export type EstablishmentOverview = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  currency: Currency;
  timeZone: string;
  hasRestaurant: boolean;
  sales: EstablishmentSales;
  devices: { active: number; stale: number; lastSyncAt: string | null };
  staff: number;
};

export type OwnerOverview = {
  period: OverviewPeriod;
  establishments: EstablishmentOverview[];
  totals: ReturnType<typeof totalsByCurrency>;
  alerts: OwnerAlert[];
};

export async function getOwnerOverview(
  db: Db,
  actor: Actor | null,
  input: { period: OverviewPeriod; now?: Date },
): Promise<OwnerOverview> {
  requireOwner(actor);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const establishments = await db.establishment.findMany({ orderBy: { createdAt: "asc" } });
  if (establishments.length === 0) {
    return { period: input.period, establishments: [], totals: [], alerts: [] };
  }

  const ranges = establishments.map((establishment) =>
    periodRange(input.period, nowIso, establishment.timeZone),
  );
  const from = new Date(Math.min(...ranges.map((range) => Date.parse(range.previousStart))));
  const to = new Date(Math.max(...ranges.map((range) => Date.parse(range.end))));
  const todayKeys = establishments.map((establishment) =>
    businessDayKey(nowIso, undefined, establishment.timeZone),
  );

  const data = await withContext(db, { establishmentId: null, isOwner: true }, async (tx) => ({
    sales: await tx.advanceInvoice.findMany({
      where: { createdAt: { gte: from, lt: to }, cancelledAt: null },
      select: { establishmentId: true, createdAt: true, totalMinor: true, currency: true },
    }),
    orders: await tx.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { establishmentId: true, createdAt: true },
    }),
    modules: await tx.establishmentModule.findMany({
      where: { enabled: true, module: "restaurant" },
      select: { establishmentId: true },
    }),
    rejected: await tx.syncOperation.groupBy({
      by: ["establishmentId"],
      where: {
        status: "rejected",
        receivedAt: { gte: new Date(now.getTime() - REJECTION_WINDOW_MS) },
      },
      _count: { _all: true },
    }),
    morning: await tx.morningStockEntry.groupBy({
      by: ["establishmentId", "day"],
      where: { day: { in: [...new Set(todayKeys)] } },
    }),
    servicePoints: await tx.servicePoint.groupBy({
      by: ["establishmentId"],
      _count: { _all: true },
    }),
  }));
  const [devices, staff] = await Promise.all([
    db.device.findMany({
      where: { revokedAt: null },
      select: { establishmentId: true, lastSyncAt: true, registeredAt: true },
    }),
    db.membership.groupBy({
      by: ["establishmentId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
  ]);

  const sales = data.sales.map((row) => ({
    establishmentId: row.establishmentId,
    createdAt: row.createdAt.toISOString(),
    totalMinor: toSafeNumber(row.totalMinor),
    currency: row.currency as Currency,
  }));
  const orders = data.orders.map((row) => ({
    establishmentId: row.establishmentId,
    createdAt: row.createdAt.toISOString(),
  }));
  const restaurantIds = new Set(data.modules.map((row) => row.establishmentId));
  const alerts: OwnerAlert[] = [];

  const overviews = establishments.map((establishment, index): EstablishmentOverview => {
    const currency = establishment.baseCurrency as Currency;
    const own = devices.filter((device) => device.establishmentId === establishment.id);
    const stale = own.filter(
      (device) =>
        now.getTime() - (device.lastSyncAt ?? device.registeredAt).getTime() > STALE_DEVICE_MS,
    ).length;
    const lastSync = own
      .map((device) => device.lastSyncAt?.toISOString() ?? null)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);
    const hasRestaurant = restaurantIds.has(establishment.id);
    const base = { establishmentId: establishment.id, establishmentName: establishment.name };

    if (establishment.status === "suspended") {
      alerts.push({
        ...base,
        kind: "suspended",
        message: "Établissement suspendu : personne ne peut y travailler.",
        href: `/proprietaire/etablissements/${establishment.id}`,
      });
    } else {
      if (stale > 0) {
        alerts.push({
          ...base,
          kind: "device-stale",
          message: `${stale} appareil${stale > 1 ? "s" : ""} sans synchronisation depuis plus de 24 heures.`,
          href: `/e/${establishment.slug}/appareils`,
        });
      }
      const rejected =
        data.rejected.find((row) => row.establishmentId === establishment.id)?._count._all ?? 0;
      if (rejected > 0) {
        alerts.push({
          ...base,
          kind: "rejected-operations",
          message: `${rejected} opération${rejected > 1 ? "s" : ""} refusée${rejected > 1 ? "s" : ""} par le serveur cette semaine.`,
          href: `/e/${establishment.slug}/appareils`,
        });
      }
      const hasPoints = data.servicePoints.some(
        (row) => row.establishmentId === establishment.id && row._count._all > 0,
      );
      const enteredToday = data.morning.some(
        (row) => row.establishmentId === establishment.id && row.day === todayKeys[index],
      );
      if (hasRestaurant && hasPoints && !enteredToday) {
        alerts.push({
          ...base,
          kind: "morning-stock",
          message: "Stock du matin pas encore saisi aujourd'hui.",
          href: `/e/${establishment.slug}/restaurant/stock-du-matin`,
        });
      }
    }

    return {
      id: establishment.id,
      slug: establishment.slug,
      name: establishment.name,
      status: establishment.status,
      currency,
      timeZone: establishment.timeZone,
      hasRestaurant,
      sales: summarizeEstablishment({
        establishment: { id: establishment.id, timeZone: establishment.timeZone, currency },
        period: input.period,
        nowIso,
        sales,
        orders,
      }),
      devices: { active: own.length, stale, lastSyncAt: lastSync ?? null },
      staff: staff.find((row) => row.establishmentId === establishment.id)?._count._all ?? 0,
    };
  });

  return {
    period: input.period,
    establishments: overviews,
    totals: totalsByCurrency(overviews.map((overview) => overview.sales)),
    alerts,
  };
}
