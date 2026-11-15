import "server-only";

import { DomainError } from "@/shared/lib/errors";
import { moneyFromMinor, type Currency, type Money } from "@/shared/lib/money";

import { summarizeDebts } from "@/modules/owner";
import {
  DEFAULT_BUSINESS_DAY_START_HOUR,
  businessDayStartOf,
  nextDayKey,
  operatingDayOf,
} from "@/modules/restaurant/domain/business-day";
import {
  adjustmentIssue,
  daysBetween,
  periodIssue,
  summarizePeriod,
  type CashAdjustmentEntry,
  type PeriodCashClosing,
  type PeriodInvoice,
  type PeriodStockLine,
  type PeriodSummary,
  type StockAdjustmentEntry,
} from "@/modules/restaurant/domain/period";
import type { SaleUnit, StockCountLine } from "@/modules/restaurant/domain/types";

import { writeAudit } from "../audit/audit";
import { authorize, type Actor } from "../authz/authorize";
import { toJson, toSafeNumber, withContext, type Db, type Tx } from "../db/context";
import { creditInvoices } from "../owner/overview";
import { jsonArray } from "./snapshots";

/**
 * Clôtures de période et écritures d'ajustement (EF-CLO-05, RG-CLO-02,
 * D-064), en ligne, depuis l'écran de gestion « Clôtures ». Gérant ou
 * propriétaire, contrôlés par `authorize` ; tout est audité.
 */

const DAY_MS = 86_400_000;

export type ValidatedDay = { day: string; validatedAt: string; validatedByName: string };

export type ClosingAdjustmentView = {
  id: string;
  day: string;
  kind: "cash" | "stock";
  /** Personne (caisse) ou « élément · point de service » (stock). */
  target: string;
  amount: Money | null;
  quantity: number | null;
  unit: SaleUnit | null;
  reason: string;
  adjustedAt: string;
  adjustedByName: string;
};

export type PeriodClosingView = {
  id: string;
  from: string;
  to: string;
  validatedAt: string;
  validatedByName: string;
  comment: string | null;
  summary: PeriodSummary;
};

export type ClosingsView = {
  currency: Currency;
  timeZone: string;
  canManage: boolean;
  validatedDays: ValidatedDay[];
  periods: PeriodClosingView[];
  adjustments: ClosingAdjustmentView[];
  /** Pour le formulaire de correction : personnes ayant déclaré une caisse, éléments comptés. */
  people: { userId: string; name: string }[];
  items: { servicePointId: string; menuItemId: string; label: string }[];
  preview: { from: string; to: string; summary: PeriodSummary | null; issue: string | null } | null;
};

async function establishmentOf(tx: Tx, establishmentId: string) {
  const establishment = await tx.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
    select: { baseCurrency: true, timeZone: true },
  });
  return {
    currency: establishment.baseCurrency as Currency,
    timeZone: establishment.timeZone,
  };
}

async function namesOf(tx: Tx, ids: readonly string[]): Promise<Map<string, string>> {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((user) => [user.id, user.displayName]));
}

/** Journées validées et périodes clôturées de l'établissement. */
async function closingState(tx: Tx, establishmentId: string) {
  const [days, periods] = await Promise.all([
    tx.dayClosing.findMany({
      where: { establishmentId },
      orderBy: { day: "desc" },
      select: {
        day: true,
        validatedAt: true,
        validatedBy: true,
        cashClosingIds: true,
        stockCountIds: true,
      },
    }),
    tx.periodClosing.findMany({ where: { establishmentId }, orderBy: { fromDay: "desc" } }),
  ]);
  return { days, periods };
}

/** Données d'une période, relues et recalculées par le serveur (CLAUDE.md § 3.9). */
async function computeSummary(
  tx: Tx,
  establishmentId: string,
  range: { from: string; to: string },
  state: Awaited<ReturnType<typeof closingState>>,
  settings: { currency: Currency; timeZone: string },
  now: Date,
): Promise<{ summary: PeriodSummary; activeDays: Set<string> }> {
  const { from, to } = range;
  const { currency, timeZone } = settings;
  const startHour = DEFAULT_BUSINESS_DAY_START_HOUR;
  const validatedAt = new Map(state.days.map((day) => [day.day, day.validatedAt.toISOString()]));
  const days = state.days.filter((day) => from <= day.day && day.day <= to);

  // Ventes : rattachées à leur journée (D-039), donc lues un jour de part et d'autre.
  const windowStart = new Date(Date.parse(businessDayStartOf(from, startHour, timeZone)) - DAY_MS);
  const windowEnd = new Date(
    Date.parse(businessDayStartOf(nextDayKey(to), startHour, timeZone)) + DAY_MS,
  );
  const [invoiceRows, morning, cashRows, countRows, adjustmentRows, points] = await Promise.all([
    tx.advanceInvoice.findMany({
      where: { establishmentId, createdAt: { gte: windowStart, lt: windowEnd } },
      select: { createdAt: true, totalMinor: true, discountMinor: true, cancelledAt: true },
    }),
    tx.morningStockEntry.findMany({
      where: { establishmentId, day: { gte: from, lte: to } },
      select: { day: true },
      distinct: ["day"],
    }),
    tx.cashClosing.findMany({
      where: {
        establishmentId,
        id: { in: days.flatMap((day) => jsonArray<string>(day.cashClosingIds)) },
      },
      select: { day: true, userId: true, lines: true },
    }),
    tx.stockCount.findMany({
      where: {
        establishmentId,
        id: { in: days.flatMap((day) => jsonArray<string>(day.stockCountIds)) },
      },
      select: { day: true, servicePointId: true, lines: true },
    }),
    tx.closingAdjustment.findMany({
      where: { establishmentId, day: { gte: from, lte: to } },
    }),
    tx.servicePoint.findMany({ where: { establishmentId }, select: { id: true, name: true } }),
  ]);
  const pointName = new Map(points.map((point) => [point.id, point.name]));
  const names = await namesOf(tx, [
    ...cashRows.map((row) => row.userId),
    ...adjustmentRows.flatMap((row) => (row.userId ? [row.userId] : [])),
  ]);

  const invoices: PeriodInvoice[] = invoiceRows.map((row) => ({
    day: operatingDayOf(row.createdAt.toISOString(), validatedAt, startHour, timeZone),
    total: moneyFromMinor(toSafeNumber(row.totalMinor), currency),
    discount: moneyFromMinor(toSafeNumber(row.discountMinor), currency),
    isCancelled: row.cancelledAt !== null,
  }));
  const cashClosings: PeriodCashClosing[] = cashRows.map((row) => ({
    day: row.day,
    userId: row.userId,
    userName: names.get(row.userId) ?? "",
    lines: jsonArray<{ expected?: Money; counted?: Money }>(row.lines).flatMap((line) =>
      line.expected && line.counted ? [{ expected: line.expected, counted: line.counted }] : [],
    ),
  }));
  const stockLines: PeriodStockLine[] = countRows.flatMap((row) =>
    jsonArray<StockCountLine>(row.lines).map((line) => ({
      day: row.day,
      servicePointId: row.servicePointId,
      servicePointName: pointName.get(row.servicePointId) ?? "",
      menuItemId: line.menuItemId,
      name: line.name,
      unit: line.unit,
      morning: line.morning,
      sold: line.sold,
      declaredOut: line.declaredOut,
      counted: line.counted,
    })),
  );
  const cashAdjustments: CashAdjustmentEntry[] = adjustmentRows.flatMap((row) =>
    row.kind === "cash" && row.userId && row.amountMinor !== null && row.currency
      ? [
          {
            day: row.day,
            userId: row.userId,
            userName: names.get(row.userId) ?? "",
            amount: moneyFromMinor(toSafeNumber(row.amountMinor), row.currency as Currency),
          },
        ]
      : [],
  );
  const stockAdjustments: StockAdjustmentEntry[] = adjustmentRows.flatMap((row) =>
    row.kind === "stock" && row.servicePointId && row.menuItemId && row.quantity !== null
      ? [
          {
            day: row.day,
            servicePointId: row.servicePointId,
            menuItemId: row.menuItemId,
            quantity: row.quantity,
          },
        ]
      : [],
  );

  const credits = await creditInvoices(tx);
  const debts = summarizeDebts({
    establishmentId,
    currency,
    rows: credits.rows,
    customerNames: credits.names,
    nowIso: now.toISOString(),
  });

  const inRange = (day: string) => from <= day && day <= to;
  const activeDays = new Set([
    ...invoices.map((invoice) => invoice.day).filter(inRange),
    ...morning.map((row) => row.day),
  ]);
  return {
    activeDays,
    summary: summarizePeriod({
      from,
      to,
      currency,
      validatedDays: days.map((day) => day.day),
      invoices,
      cashClosings,
      stockLines,
      cashAdjustments,
      stockAdjustments,
      debtsOutstanding: debts.outstanding,
    }),
  };
}

/** Écran « Clôtures » : journées validées, périodes, corrections, aperçu d'une période. */
export async function getClosingsView(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; preview?: { from: string; to: string } | null; now?: Date },
): Promise<ClosingsView> {
  const access = await authorize(db, actor, "restaurant.closing.read", {
    establishmentId: input.establishmentId,
  });
  const canManage = await authorize(db, actor, "restaurant.closing.validate", {
    establishmentId: input.establishmentId,
  }).then(
    () => true,
    () => false,
  );
  const now = input.now ?? new Date();
  return withContext(db, access.dbContext, async (tx) => {
    const settings = await establishmentOf(tx, input.establishmentId);
    const state = await closingState(tx, input.establishmentId);
    const [adjustmentRows, cashUsers, counted] = await Promise.all([
      tx.closingAdjustment.findMany({
        where: { establishmentId: input.establishmentId },
        orderBy: { adjustedAt: "desc" },
        take: 100,
      }),
      tx.cashClosing.findMany({
        where: { establishmentId: input.establishmentId },
        select: { userId: true },
        distinct: ["userId"],
      }),
      tx.menuItem.findMany({
        where: { establishmentId: input.establishmentId, kind: "simple" },
        select: { id: true, name: true, unit: true, servicePointId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const points = await tx.servicePoint.findMany({
      where: { establishmentId: input.establishmentId },
      select: { id: true, name: true },
    });
    const pointName = new Map(points.map((point) => [point.id, point.name]));
    const itemOf = new Map(counted.map((item) => [item.id, item]));
    const names = await namesOf(tx, [
      ...state.days.map((day) => day.validatedBy),
      ...state.periods.map((period) => period.validatedBy),
      ...adjustmentRows.map((row) => row.adjustedBy),
      ...adjustmentRows.flatMap((row) => (row.userId ? [row.userId] : [])),
      ...cashUsers.map((row) => row.userId),
    ]);

    let preview: ClosingsView["preview"] = null;
    if (input.preview) {
      const issue = periodIssue({
        from: input.preview.from,
        to: input.preview.to,
        validatedDays: new Set(state.days.map((day) => day.day)),
        activeDays: new Set(),
        periods: state.periods,
      });
      if (issue && issue.code !== "DAY_NOT_VALIDATED") {
        preview = { ...input.preview, summary: null, issue: issue.message };
      } else {
        const computed = await computeSummary(
          tx,
          input.establishmentId,
          input.preview,
          state,
          settings,
          now,
        );
        const full = periodIssue({
          from: input.preview.from,
          to: input.preview.to,
          validatedDays: new Set(state.days.map((day) => day.day)),
          activeDays: computed.activeDays,
          periods: state.periods,
        });
        preview = { ...input.preview, summary: computed.summary, issue: full?.message ?? null };
      }
    }

    return {
      ...settings,
      canManage,
      validatedDays: state.days.map((day) => ({
        day: day.day,
        validatedAt: day.validatedAt.toISOString(),
        validatedByName: names.get(day.validatedBy) ?? "",
      })),
      periods: state.periods.map((period) => ({
        id: period.id,
        from: period.fromDay,
        to: period.toDay,
        validatedAt: period.validatedAt.toISOString(),
        validatedByName: names.get(period.validatedBy) ?? "",
        comment: period.comment,
        summary: period.summary as unknown as PeriodSummary,
      })),
      adjustments: adjustmentRows.map((row) => {
        const item = row.menuItemId ? itemOf.get(row.menuItemId) : undefined;
        return {
          id: row.id,
          day: row.day,
          kind: row.kind === "stock" ? "stock" : "cash",
          target:
            row.kind === "stock"
              ? `${item?.name ?? "Élément"} · ${pointName.get(row.servicePointId ?? "") ?? ""}`
              : (names.get(row.userId ?? "") ?? ""),
          amount:
            row.amountMinor !== null && row.currency
              ? moneyFromMinor(toSafeNumber(row.amountMinor), row.currency as Currency)
              : null,
          quantity: row.quantity,
          unit: (item?.unit as SaleUnit | undefined) ?? null,
          reason: row.reason,
          adjustedAt: row.adjustedAt.toISOString(),
          adjustedByName: names.get(row.adjustedBy) ?? "",
        };
      }),
      people: cashUsers
        .map((row) => ({ userId: row.userId, name: names.get(row.userId) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      items: counted.map((item) => ({
        servicePointId: item.servicePointId,
        menuItemId: item.id,
        label: `${item.name} · ${pointName.get(item.servicePointId) ?? ""}`,
      })),
      preview,
    };
  });
}

export type AdjustmentInput =
  | { kind: "cash"; day: string; userId: string; amountMajor: number; reason: string }
  | {
      kind: "stock";
      day: string;
      servicePointId: string;
      menuItemId: string;
      quantity: number;
      reason: string;
    };

/** RG-CLO-02 : corrige une journée validée par une écriture datée et motivée. */
export async function recordClosingAdjustment(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; adjustment: AdjustmentInput },
  meta: { ip?: string | null } = {},
): Promise<{ id: string }> {
  const access = await authorize(db, actor, "restaurant.closing.validate", {
    establishmentId: input.establishmentId,
  });
  const { adjustment } = input;
  return withContext(db, access.dbContext, async (tx) => {
    const settings = await establishmentOf(tx, input.establishmentId);
    const state = await closingState(tx, input.establishmentId);
    const value =
      adjustment.kind === "cash" ? Math.round(adjustment.amountMajor * 100) : adjustment.quantity;
    if (adjustment.kind === "cash" && value % 100 !== 0) {
      throw new DomainError("INVALID_VALUE", "La correction se fait en francs entiers.");
    }
    const issue = adjustmentIssue({
      day: adjustment.day,
      reason: adjustment.reason,
      value,
      validatedDays: new Set(state.days.map((day) => day.day)),
      periods: state.periods,
    });
    if (issue) throw new DomainError(issue.code, issue.message);

    // La cible est relue dans l'établissement (IDOR, CLAUDE.md § 5.4).
    if (adjustment.kind === "cash") {
      const declared = await tx.cashClosing.findFirst({
        where: { establishmentId: input.establishmentId, userId: adjustment.userId },
        select: { id: true },
      });
      if (!declared) {
        throw new DomainError("PERSON_NOT_FOUND", "Cette personne n'a déclaré aucune caisse ici.");
      }
    } else {
      const item = await tx.menuItem.findFirst({
        where: {
          id: adjustment.menuItemId,
          establishmentId: input.establishmentId,
          servicePointId: adjustment.servicePointId,
        },
        select: { id: true },
      });
      if (!item) throw new DomainError("ITEM_NOT_FOUND", "Élément inconnu à ce point de service.");
    }

    const created = await tx.closingAdjustment.create({
      data: {
        establishmentId: input.establishmentId,
        day: adjustment.day,
        kind: adjustment.kind,
        reason: adjustment.reason.trim(),
        adjustedBy: actor?.userId ?? "",
        ...(adjustment.kind === "cash"
          ? {
              userId: adjustment.userId,
              currency: settings.currency,
              amountMinor: BigInt(value),
            }
          : {
              servicePointId: adjustment.servicePointId,
              menuItemId: adjustment.menuItemId,
              quantity: value,
            }),
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      establishmentId: input.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "restaurant.closing.adjusted",
      entity: "closing_adjustment",
      entityId: created.id,
      after:
        adjustment.kind === "cash"
          ? { day: adjustment.day, kind: "cash", userId: adjustment.userId, amountMinor: value }
          : {
              day: adjustment.day,
              kind: "stock",
              menuItemId: adjustment.menuItemId,
              quantity: value,
            },
      reason: adjustment.reason.trim(),
      ip: meta.ip ?? null,
    });
    return created;
  });
}

/** EF-CLO-05 : valide une période ; son résumé, recalculé ici, est figé. */
export async function validatePeriod(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; from: string; to: string; comment: string; now?: Date },
  meta: { ip?: string | null } = {},
): Promise<{ id: string; summary: PeriodSummary }> {
  const access = await authorize(db, actor, "restaurant.closing.validate", {
    establishmentId: input.establishmentId,
  });
  const now = input.now ?? new Date();
  return withContext(db, access.dbContext, async (tx) => {
    const settings = await establishmentOf(tx, input.establishmentId);
    const state = await closingState(tx, input.establishmentId);
    const range = { from: input.from, to: input.to };
    const early = periodIssue({
      ...range,
      validatedDays: new Set(state.days.map((day) => day.day)),
      activeDays: new Set(daysBetween(input.from, input.to)),
      periods: state.periods,
    });
    if (early && early.code !== "DAY_NOT_VALIDATED") {
      throw new DomainError(early.code, early.message);
    }
    const { summary, activeDays } = await computeSummary(
      tx,
      input.establishmentId,
      range,
      state,
      settings,
      now,
    );
    const issue = periodIssue({
      ...range,
      validatedDays: new Set(state.days.map((day) => day.day)),
      activeDays,
      periods: state.periods,
    });
    if (issue) throw new DomainError(issue.code, issue.message);

    const comment = input.comment.trim() || null;
    const created = await tx.periodClosing.create({
      data: {
        establishmentId: input.establishmentId,
        fromDay: input.from,
        toDay: input.to,
        summary: toJson(summary),
        comment,
        validatedBy: actor?.userId ?? "",
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      establishmentId: input.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "restaurant.period.closed",
      entity: "period_closing",
      entityId: created.id,
      after: {
        from: input.from,
        to: input.to,
        days: summary.validatedDays.length,
        revenueMinor: summary.revenue.amountMinor,
        cash: summary.cash.map((entry) => ({
          currency: entry.currency,
          varianceMinor: entry.variance.amountMinor,
        })),
      },
      ...(comment ? { reason: comment } : {}),
      ip: meta.ip ?? null,
    });
    return { id: created.id, summary };
  });
}

/**
 * Écarts de caisse et de stock des journées validées d'un intervalle, comme
 * pour une période (rapports, EF-RAP-03). Le contexte RLS est déjà posé.
 */
export async function closingSummaryForRange(
  tx: Tx,
  establishmentId: string,
  range: { from: string; to: string },
  now: Date,
): Promise<{ summary: PeriodSummary; days: ValidatedDay[]; periods: PeriodClosingView[] }> {
  const settings = await establishmentOf(tx, establishmentId);
  const state = await closingState(tx, establishmentId);
  const { summary } = await computeSummary(tx, establishmentId, range, state, settings, now);
  const inRange = (day: string) => range.from <= day && day <= range.to;
  const names = await namesOf(tx, [
    ...state.days.map((day) => day.validatedBy),
    ...state.periods.map((period) => period.validatedBy),
  ]);
  return {
    summary,
    days: state.days
      .filter((day) => inRange(day.day))
      .map((day) => ({
        day: day.day,
        validatedAt: day.validatedAt.toISOString(),
        validatedByName: names.get(day.validatedBy) ?? "",
      })),
    periods: state.periods
      .filter((period) => period.fromDay <= range.to && range.from <= period.toDay)
      .map((period) => ({
        id: period.id,
        from: period.fromDay,
        to: period.toDay,
        validatedAt: period.validatedAt.toISOString(),
        validatedByName: names.get(period.validatedBy) ?? "",
        comment: period.comment,
        summary: period.summary as unknown as PeriodSummary,
      })),
  };
}
