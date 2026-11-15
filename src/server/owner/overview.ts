import { formatMoney, type Currency } from "@/shared/lib/money";

import {
  cashTotals,
  periodDayKeys,
  periodRange,
  summarizeClosings,
  summarizeEstablishment,
  totalsByCurrency,
  type CashClosingRow,
  type CashSummary,
  type ClosingLineRow,
  type EstablishmentClosings,
  type EstablishmentSales,
  type OverviewPeriod,
  type Shortage,
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
  kind:
    | "suspended"
    | "device-stale"
    | "rejected-operations"
    | "morning-stock"
    | "day-not-validated"
    | "cash-shortage";
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
  /** Clôtures de la période (EF-CLO-04, D-056). */
  closings: EstablishmentClosings;
  devices: { active: number; stale: number; lastSyncAt: string | null };
  staff: number;
};

export type OwnerOverview = {
  period: OverviewPeriod;
  establishments: EstablishmentOverview[];
  totals: ReturnType<typeof totalsByCurrency>;
  /** Cash attendu, déclaré et manquants de la période, par devise (EF-PRO-01). */
  cash: CashSummary[];
  /** Manquants nommés de la période (RG-CLO-01), du plus récent au plus ancien. */
  shortages: (Shortage & { establishmentName: string })[];
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
    return {
      period: input.period,
      establishments: [],
      totals: [],
      cash: [],
      shortages: [],
      alerts: [],
    };
  }

  const ranges = establishments.map((establishment) =>
    periodRange(input.period, nowIso, establishment.timeZone),
  );
  const from = new Date(
    Math.min(
      ...ranges.map((range) => Date.parse(range.previousStart)),
      ...weekStarts(nowIso, establishments),
    ),
  );
  const to = new Date(Math.max(...ranges.map((range) => Date.parse(range.end))));
  const todayKeys = establishments.map((establishment) =>
    businessDayKey(nowIso, undefined, establishment.timeZone),
  );
  const dayKeys = establishments.map((establishment) =>
    periodDayKeys(
      periodRange(input.period, nowIso, establishment.timeZone),
      establishment.timeZone,
    ),
  );
  // EF-CLO-04 : une journée non validée est signalée pendant 7 jours, quelle que soit la période.
  const weekRanges = establishments.map((establishment) =>
    periodRange("semaine", nowIso, establishment.timeZone),
  );
  const checkKeys = establishments.map((establishment, index) => {
    const week = weekRanges[index];
    return week ? periodDayKeys(week, establishment.timeZone) : [];
  });
  const allDayKeys = [...new Set([...dayKeys.flat(), ...checkKeys.flat()])];

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
    cashClosings: await tx.cashClosing.findMany({
      where: { day: { in: allDayKeys } },
      select: { establishmentId: true, day: true, userId: true, lines: true, comment: true },
    }),
    dayClosings: await tx.dayClosing.findMany({
      where: { day: { in: allDayKeys } },
      select: { establishmentId: true, day: true },
    }),
    lastValidated: await tx.dayClosing.groupBy({
      by: ["establishmentId"],
      _max: { day: true },
    }),
  }));
  const closers = await db.user.findMany({
    where: { id: { in: [...new Set(data.cashClosings.map((row) => row.userId))] } },
    select: { id: true, displayName: true },
  });
  const closerName = new Map(closers.map((user) => [user.id, user.displayName]));
  const cashClosings: CashClosingRow[] = data.cashClosings.map((row) => ({
    establishmentId: row.establishmentId,
    day: row.day,
    userName: closerName.get(row.userId) ?? "",
    lines: closingLines(row.lines),
    comment: row.comment,
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
    const closings = summarizeClosings({
      establishmentId: establishment.id,
      dayKeys: dayKeys[index] ?? [],
      todayKey: todayKeys[index] ?? "",
      checkDays: checkKeys[index] ?? [],
      cashClosings,
      validatedDays: data.dayClosings,
      activeDays: new Set(
        sales
          .filter((sale) => sale.establishmentId === establishment.id)
          .map((sale) => businessDayKey(sale.createdAt, undefined, establishment.timeZone)),
      ),
      lastValidatedDay:
        data.lastValidated.find((row) => row.establishmentId === establishment.id)?._max.day ??
        null,
    });

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
      // EF-CLO-04 : une journée passée doit être clôturée et validée par le gérant.
      const firstUnvalidated = closings.unvalidatedDays[0];
      if (hasRestaurant && firstUnvalidated) {
        const count = closings.unvalidatedDays.length;
        alerts.push({
          ...base,
          kind: "day-not-validated",
          message:
            count > 1
              ? `${count} journées passées pas encore validées (la première : ${formatDayKey(firstUnvalidated)}).`
              : `La journée du ${formatDayKey(firstUnvalidated)} n'est pas encore validée.`,
          href: `/e/${establishment.slug}/journal`,
        });
      }
      // RG-CLO-01 : les manquants sont nommés.
      const shortage = closings.cash.filter((entry) => entry.shortage.amountMinor > 0);
      if (shortage.length > 0) {
        alerts.push({
          ...base,
          kind: "cash-shortage",
          message: `Manquants de caisse : ${shortage.map((entry) => formatMoney(entry.shortage)).join(" et ")} (${closings.shortages.length} déclaration${closings.shortages.length > 1 ? "s" : ""}).`,
          href: "#manquants",
        });
      }
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
      closings,
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

  const names = new Map(overviews.map((overview) => [overview.id, overview.name]));
  return {
    period: input.period,
    establishments: overviews,
    totals: totalsByCurrency(overviews.map((overview) => overview.sales)),
    cash: cashTotals(overviews.map((overview) => overview.closings)),
    shortages: overviews
      .flatMap((overview) => overview.closings.shortages)
      .map((shortage) => ({
        ...shortage,
        establishmentName: names.get(shortage.establishmentId) ?? "",
      }))
      .sort((a, b) => b.day.localeCompare(a.day)),
    alerts,
  };
}

/** Lignes d'une clôture de caisse enregistrées en JSON (`cash_closings.lines`). */
function closingLines(value: unknown): ClosingLineRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line: unknown) => {
    const entry = line as {
      expected?: { amountMinor?: unknown; currency?: unknown };
      counted?: { amountMinor?: unknown };
    };
    const currency = entry.expected?.currency;
    const expected = entry.expected?.amountMinor;
    const counted = entry.counted?.amountMinor;
    if (
      (currency !== "CDF" && currency !== "USD") ||
      typeof expected !== "number" ||
      typeof counted !== "number"
    ) {
      return [];
    }
    return [{ currency, expectedMinor: expected, countedMinor: counted }];
  });
}

/** `2026-11-06` devient « 06/11 ». */
function formatDayKey(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** Début de la semaine glissante de chaque établissement (journées à vérifier). */
function weekStarts(nowIso: string, establishments: readonly { timeZone: string }[]): number[] {
  return establishments.map((establishment) =>
    Date.parse(periodRange("semaine", nowIso, establishment.timeZone).start),
  );
}
