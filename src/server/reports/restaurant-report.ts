import "server-only";

import { toCsv } from "@/shared/lib/csv";
import { formatDate, formatTime, localHour } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  formatMoney,
  moneyFromMinor,
  toMajor,
  type Currency,
  type Money,
} from "@/shared/lib/money";

import { readSettings } from "@/modules/owner";
import {
  DEFAULT_BUSINESS_DAY_START_HOUR,
  businessDayStartOf,
  nextDayKey,
  operatingDayOf,
} from "@/modules/restaurant/domain/business-day";
import { MAX_PERIOD_DAYS, daysBetween, formatDay } from "@/modules/restaurant/domain/period";
import type { PeriodSummary } from "@/modules/restaurant/domain/period";
import {
  buildSalesReport,
  type ReportInvoice,
  type ReportPayment,
  type SalesReport,
} from "@/modules/restaurant/domain/report";
import type {
  MobileMoneyProvider,
  PaymentMethod,
  SaleUnit,
} from "@/modules/restaurant/domain/types";

import { writeAudit } from "../audit/audit";
import { authorize, type Actor } from "../authz/authorize";
import { toSafeNumber, withContext, type Db, type Tx } from "../db/context";
import { renderPdf } from "../exports/pdf";
import { buildReportDocument, type ReportExport } from "../exports/table-document";
import { buildReportWorkbook } from "../exports/xlsx";
import {
  closingSummaryForRange,
  type PeriodClosingView,
  type ValidatedDay,
} from "../restaurant/periods";

/**
 * Rapports du restaurant (EF-RAP-01, EF-RAP-03, EF-RAP-04, D-065) : ventes de
 * la période, écarts de caisse et de stock des journées validées, historique
 * des clôtures. Gérant, lecteur et propriétaire (`reports.read`) ; chaque
 * export est audité. La marge (EF-RAP-02) attend les prix de revient.
 */

const DAY_MS = 86_400_000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type ReportView = {
  establishment: { name: string; address: string | null; phone: string | null };
  currency: Currency;
  timeZone: string;
  sales: SalesReport;
  closings: PeriodSummary;
  days: ValidatedDay[];
  periods: PeriodClosingView[];
};

type SaleLine = {
  day: string;
  time: string;
  number: string;
  pointName: string;
  waiterName: string;
  item: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  isCancelled: boolean;
};

function checkRange(from: string, to: string): void {
  if (!DAY_KEY.test(from) || !DAY_KEY.test(to) || from > to) {
    throw new DomainError("INVALID_RANGE", "Choisissez une première et une dernière journée.");
  }
  if (daysBetween(from, to).length > MAX_PERIOD_DAYS) {
    throw new DomainError(
      "PERIOD_TOO_LONG",
      `Un rapport couvre ${MAX_PERIOD_DAYS} journées au plus.`,
    );
  }
}

async function loadReport(
  tx: Tx,
  establishmentId: string,
  range: { from: string; to: string },
  now: Date,
): Promise<{ view: ReportView; lines: SaleLine[] }> {
  const establishment = await tx.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
    select: { name: true, baseCurrency: true, timeZone: true, settings: true },
  });
  const currency = establishment.baseCurrency as Currency;
  const { timeZone } = establishment;
  const startHour = DEFAULT_BUSINESS_DAY_START_HOUR;
  const identity = readSettings(establishment.settings?.settings).identity;

  const days = await tx.dayClosing.findMany({
    where: { establishmentId },
    select: { day: true, validatedAt: true },
  });
  const validatedAt = new Map(days.map((day) => [day.day, day.validatedAt.toISOString()]));
  // Une vente appartient à sa journée selon D-039 : lecture d'un jour de part et d'autre.
  const windowStart = new Date(
    Date.parse(businessDayStartOf(range.from, startHour, timeZone)) - DAY_MS,
  );
  const windowEnd = new Date(
    Date.parse(businessDayStartOf(nextDayKey(range.to), startHour, timeZone)) + DAY_MS,
  );
  const inRange = (day: string) => range.from <= day && day <= range.to;
  const dayOf = (date: Date) =>
    operatingDayOf(date.toISOString(), validatedAt, startHour, timeZone);

  const [invoiceRows, paymentRows, items, points] = await Promise.all([
    tx.advanceInvoice.findMany({
      where: { establishmentId, createdAt: { gte: windowStart, lt: windowEnd } },
      select: {
        id: true,
        orderId: true,
        number: true,
        servicePointId: true,
        createdAt: true,
        totalMinor: true,
        discountMinor: true,
        cancelledAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.payment.findMany({
      where: { establishmentId, createdAt: { gte: windowStart, lt: windowEnd } },
      select: {
        method: true,
        provider: true,
        currency: true,
        createdAt: true,
        baseAmountMinor: true,
        changeMinor: true,
      },
    }),
    tx.menuItem.findMany({
      where: { establishmentId },
      select: {
        id: true,
        name: true,
        servicePointId: true,
        unit: true,
        priceMinor: true,
        archivedAt: true,
        kind: true,
      },
    }),
    tx.servicePoint.findMany({
      where: { establishmentId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const invoicesInRange = invoiceRows.filter((row) => inRange(dayOf(row.createdAt)));
  const [lineRows, orders] = await Promise.all([
    tx.invoiceLine.findMany({
      where: { establishmentId, invoiceId: { in: invoicesInRange.map((row) => row.id) } },
      select: {
        invoiceId: true,
        menuItemId: true,
        name: true,
        quantity: true,
        unitPriceMinor: true,
        lineTotalMinor: true,
      },
    }),
    tx.order.findMany({
      where: {
        establishmentId,
        id: { in: [...new Set(invoicesInRange.map((row) => row.orderId))] },
      },
      select: { id: true, waiterId: true },
    }),
  ]);
  const waiterOf = new Map(orders.map((order) => [order.id, order.waiterId]));
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(orders.map((order) => order.waiterId))] } },
    select: { id: true, displayName: true },
  });
  const waiterNames = new Map(users.map((user) => [user.id, user.displayName]));
  const pointName = new Map(points.map((point) => [point.id, point.name]));
  const money = (minor: bigint) => moneyFromMinor(toSafeNumber(minor), currency);

  const invoices: ReportInvoice[] = invoicesInRange.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    day: dayOf(row.createdAt),
    hour: localHour(row.createdAt.toISOString(), timeZone),
    servicePointId: row.servicePointId,
    waiterId: waiterOf.get(row.orderId) ?? "",
    total: money(row.totalMinor),
    discount: money(row.discountMinor),
    isCancelled: row.cancelledAt !== null,
  }));
  const payments: ReportPayment[] = paymentRows
    .filter((row) => inRange(dayOf(row.createdAt)))
    .map((row) => ({
      method: row.method as PaymentMethod,
      provider: (row.provider as MobileMoneyProvider | null) ?? null,
      tenderedCurrency: row.currency as Currency,
      net: money(row.baseAmountMinor - row.changeMinor),
    }));

  const sales = buildSalesReport({
    ...range,
    currency,
    invoices,
    lines: lineRows.map((line) => ({
      invoiceId: line.invoiceId,
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      lineTotal: money(line.lineTotalMinor),
    })),
    payments,
    items: items
      .filter((item) => item.kind !== "formula")
      .map((item) => ({
        id: item.id,
        name: item.name,
        servicePointId: item.servicePointId,
        unit: item.unit as SaleUnit,
        isSellable: item.priceMinor !== null && item.archivedAt === null,
      })),
    servicePoints: points,
    waiterNames,
  });

  const invoiceById = new Map(invoicesInRange.map((row) => [row.id, row]));
  const lines: SaleLine[] = lineRows.flatMap((line) => {
    const invoice = invoiceById.get(line.invoiceId);
    if (!invoice) return [];
    const createdAt = invoice.createdAt.toISOString();
    return [
      {
        day: dayOf(invoice.createdAt),
        time: formatTime(createdAt, timeZone),
        number: invoice.number,
        pointName: pointName.get(invoice.servicePointId ?? "") ?? "",
        waiterName: waiterNames.get(waiterOf.get(invoice.orderId) ?? "") ?? "",
        item: line.name,
        quantity: line.quantity,
        unitPrice: money(line.unitPriceMinor),
        lineTotal: money(line.lineTotalMinor),
        isCancelled: invoice.cancelledAt !== null,
      },
    ];
  });
  lines.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));

  const closings = await closingSummaryForRange(tx, establishmentId, range, now);
  return {
    view: {
      establishment: { name: establishment.name, address: identity.address, phone: identity.phone },
      currency,
      timeZone,
      sales,
      closings: closings.summary,
      days: closings.days,
      periods: closings.periods,
    },
    lines,
  };
}

/** Rapport affiché à l'écran « Rapports ». */
export async function getRestaurantReport(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; from: string; to: string; now?: Date },
): Promise<ReportView> {
  const access = await authorize(db, actor, "reports.read", {
    establishmentId: input.establishmentId,
  });
  checkRange(input.from, input.to);
  const { view } = await withContext(db, access.dbContext, (tx) =>
    loadReport(tx, input.establishmentId, input, input.now ?? new Date()),
  );
  return view;
}

export const REPORT_FORMATS = ["xlsx", "pdf", "csv"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const MIME: Record<ReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv;charset=utf-8",
};

/** Lignes d'un rapport exporté : montants en unités (francs), donc additionnables. */
export function reportSections(view: ReportView): ReportExport["sections"] {
  const { sales, closings } = view;
  const major = (value: Money) => toMajor(value);
  const unit = `(${view.currency === "USD" ? "$" : "FC"})`;
  return [
    {
      title: "Synthèse",
      header: ["Indicateur", `Valeur ${unit}`],
      columnWeights: [3, 2],
      rows: [
        ["Ventes (remises déduites)", major(sales.revenue)],
        ["Commandes", sales.orders],
        ["Factures", sales.invoices],
        ["Panier moyen", major(sales.averageOrder)],
        ["Remises accordées", major(sales.discounts)],
        ["Factures annulées", sales.cancelled.count],
        ["Montant annulé", major(sales.cancelled.amount)],
        ["Dettes clients à ce jour", major(closings.debtsOutstanding)],
        ["Marge et bénéfice", "En attente des prix de revient (EF-RAP-02)"],
      ],
    },
    {
      title: "Points de service",
      header: ["Point de service", "Factures", `Ventes ${unit}`, "Part (%)"],
      columnWeights: [3, 1, 2, 1],
      rows: sales.byPoint.map((point) => [
        point.name,
        point.invoices,
        major(point.revenue),
        Math.round(point.share * 1000) / 10,
      ]),
      emptyLabel: "Aucune vente.",
    },
    {
      title: "Serveurs",
      header: ["Serveur", "Commandes", `Ventes ${unit}`],
      columnWeights: [3, 1, 2],
      rows: sales.byWaiter.map((waiter) => [waiter.name, waiter.orders, major(waiter.revenue)]),
      emptyLabel: "Aucune vente.",
    },
    {
      title: "Articles vendus",
      header: ["Article", "Point de service", "Quantité", `Montant avant remises ${unit}`],
      columnWeights: [3, 2, 1, 2],
      rows: sales.byItem.map((item) => [
        item.name,
        item.pointName,
        item.quantity,
        major(item.revenue),
      ]),
      emptyLabel: "Aucune vente.",
    },
    {
      title: "Moins vendus",
      header: ["Article", "Point de service", "Quantité"],
      columnWeights: [3, 2, 1],
      rows: sales.bottomItems.map((item) => [item.name, item.pointName, item.quantity]),
      emptyLabel: "Aucun article vendable.",
    },
    {
      title: "Par heure",
      header: ["Heure", "Commandes", `Ventes ${unit}`],
      columnWeights: [1, 1, 2],
      rows: sales.byHour.map((entry) => [
        `${String(entry.hour).padStart(2, "0")} h`,
        entry.orders,
        major(entry.revenue),
      ]),
      emptyLabel: "Aucune vente.",
    },
    {
      title: "Modes de paiement",
      header: ["Mode", `Encaissé ${unit}`],
      columnWeights: [3, 2],
      rows: sales.byMethod.map((entry) => [entry.label, major(entry.amount)]),
      emptyLabel: "Aucun encaissement.",
    },
    {
      title: "Caisse par personne",
      header: [
        "Personne",
        `Attendu ${unit}`,
        `Compté ${unit}`,
        `Corrections ${unit}`,
        `Écart ${unit}`,
      ],
      columnWeights: [3, 2, 2, 2, 2],
      rows: closings.people.map((person) => [
        person.userName,
        major(person.expected),
        major(person.counted),
        major(person.adjusted),
        major(person.variance),
      ]),
      emptyLabel: "Aucune caisse déclarée sur les journées validées.",
    },
    {
      title: "Écarts de stock",
      header: ["Article", "Point de service", "Vendus", "Sorties déclarées", "Écart"],
      columnWeights: [3, 2, 1, 1, 1],
      rows: closings.stock.map((line) => [
        line.name,
        line.servicePointName,
        line.sold,
        line.declaredOut,
        line.variance,
      ]),
      emptyLabel: "Aucun écart de stock sur les journées validées.",
    },
    {
      title: "Journées validées",
      header: ["Journée", "Validée par", "Le"],
      columnWeights: [2, 3, 2],
      rows: view.days.map((day) => [
        formatDay(day.day),
        day.validatedByName,
        `${formatDate(day.validatedAt, view.timeZone)} ${formatTime(day.validatedAt, view.timeZone)}`,
      ]),
      emptyLabel: "Aucune journée validée.",
    },
  ];
}

/** EF-RAP-04 : export PDF (en-tête de l'établissement), Excel ou CSV des ventes détaillées. */
export async function exportRestaurantReport(
  db: Db,
  actor: Actor | null,
  input: { establishmentId: string; from: string; to: string; format: ReportFormat },
  meta: { ip?: string | null; now?: Date } = {},
): Promise<{ filename: string; mimeType: string; base64: string }> {
  const access = await authorize(db, actor, "reports.read", {
    establishmentId: input.establishmentId,
  });
  checkRange(input.from, input.to);
  const now = meta.now ?? new Date();
  const { view, lines } = await withContext(db, access.dbContext, (tx) =>
    loadReport(tx, input.establishmentId, input, now),
  );
  const nowIso = now.toISOString();
  const generatedAt = `${formatDate(nowIso, view.timeZone)} à ${formatTime(nowIso, view.timeZone)}`;
  const period = `Du ${formatDay(input.from)} au ${formatDay(input.to)}`;
  const report: ReportExport = {
    title: "Rapport du restaurant",
    establishment: [
      view.establishment.name,
      ...(view.establishment.address ? [view.establishment.address] : []),
      ...(view.establishment.phone ? [view.establishment.phone] : []),
    ],
    details: [
      period,
      `Ventes : ${formatMoney(view.sales.revenue)} · ${view.sales.orders} commande${view.sales.orders > 1 ? "s" : ""}`,
    ],
    sections: reportSections(view),
    generatedAt,
  };

  let content: Buffer;
  if (input.format === "csv") {
    const unit = view.currency === "USD" ? "$" : "FC";
    content = Buffer.from(
      toCsv(
        [
          "Journée",
          "Heure",
          "Facture",
          "Point de service",
          "Serveur",
          "Article",
          "Quantité",
          `Prix unitaire (${unit})`,
          `Total (${unit})`,
          "Statut",
        ],
        lines.map((line) => [
          formatDay(line.day),
          line.time,
          line.number,
          line.pointName,
          line.waiterName,
          line.item,
          line.quantity,
          toMajor(line.unitPrice),
          toMajor(line.lineTotal),
          line.isCancelled ? "Annulée" : "",
        ]),
      ),
      "utf8",
    );
  } else if (input.format === "xlsx") {
    content = await buildReportWorkbook(report);
  } else {
    content = await renderPdf(buildReportDocument(report), {
      footerLabel: `OPTIMA · ${view.establishment.name} · ${period}`,
    });
  }

  await withContext(db, access.dbContext, (tx) =>
    writeAudit(tx, {
      establishmentId: input.establishmentId,
      actorUserId: actor?.userId ?? null,
      actorRole: access.role,
      action: "reports.exported",
      entity: "report",
      after: { from: input.from, to: input.to, format: input.format },
      ip: meta.ip ?? null,
    }),
  );

  return {
    filename: `rapport-${input.from}-${input.to}.${input.format}`,
    mimeType: MIME[input.format],
    base64: content.toString("base64"),
  };
}
