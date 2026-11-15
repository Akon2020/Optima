import { businessDayStart } from "@/modules/restaurant/domain/business-day";
import type {
  AdjustmentDecision,
  AdjustmentRequest,
  AdvanceInvoice,
  CashClosing,
  Customer,
  DayClosing,
  DiningTable,
  ExchangeRate,
  MenuItem,
  MorningStockEntry,
  Order,
  Payment,
  ServicePoint,
  StaffMember,
  StockCount,
  TableRelease,
} from "@/modules/restaurant/domain/types";

import type { Db } from "../db/context";
import { withContext } from "../db/context";
import {
  adjustmentDecisionSnapshots,
  adjustmentRequestSnapshots,
  cashClosingSnapshots,
  customerSnapshot,
  dayClosingSnapshots,
  diningTableSnapshot,
  exchangeRateSnapshots,
  menuItemSnapshot,
  morningEntrySnapshots,
  orderSnapshots,
  paymentSnapshots,
  servicePointSnapshot,
  stockCountSnapshots,
  tableReleaseSnapshots,
} from "../restaurant/snapshots";
import type { AuthenticatedDevice } from "./devices";

/**
 * État initial d'un appareil (GET /api/sync/bootstrap) : ce qu'il faut pour
 * travailler aujourd'hui, rien de plus (CLAUDE.md § 5.5) : menus, tables,
 * personnel, et l'activité depuis le début de la journée d'exploitation de la
 * veille (nécessaire à la proposition du stock du matin). Le curseur renvoyé
 * permet ensuite de ne recevoir que les changements.
 */
export type DeviceBootstrap = {
  establishment: { id: string; slug: string; name: string; currency: string; timeZone: string };
  device: { id: string; code: string };
  servicePoints: ServicePoint[];
  menuItems: MenuItem[];
  tables: DiningTable[];
  staff: StaffMember[];
  orders: Order[];
  invoices: AdvanceInvoice[];
  morningEntries: MorningStockEntry[];
  releases: TableRelease[];
  /** Modules actifs (EF-MOD-02) : l'appareil masque les écrans des autres. */
  modules: string[];
  /** Paiements de la même période et derniers taux du dollar (EF-ENC-02, EF-PRX-05). */
  payments: Payment[];
  exchangeRates: ExchangeRate[];
  /** Clôtures de la même période et dernières journées validées (EF-CLO-01 à 04). */
  cashClosings: CashClosing[];
  stockCounts: StockCount[];
  dayClosings: DayClosing[];
  /** Demandes d'annulation ou de remise récentes et leurs décisions (D-058). */
  adjustmentRequests: AdjustmentRequest[];
  adjustmentDecisions: AdjustmentDecision[];
  /** Fiches clients, et commandes plus anciennes encore dues par un client (D-059). */
  customers: Customer[];
  cursor: string;
};

const DAY_MS = 24 * 3_600_000;

export async function buildBootstrap(
  db: Db,
  device: AuthenticatedDevice,
  now: Date = new Date(),
): Promise<DeviceBootstrap> {
  const establishment = await db.establishment.findUniqueOrThrow({
    where: { id: device.establishmentId },
    select: { id: true, slug: true, name: true, baseCurrency: true, timeZone: true },
  });
  const since = new Date(
    new Date(businessDayStart(now.toISOString(), 6, establishment.timeZone)).getTime() - DAY_MS,
  );
  const members = await db.membership.findMany({
    where: { establishmentId: establishment.id, status: "active", user: { status: "active" } },
    include: { user: { select: { displayName: true } } },
  });

  return withContext(db, { establishmentId: establishment.id, isOwner: false }, async (tx) => {
    const where = { establishmentId: establishment.id };
    const [
      servicePoints,
      menuItems,
      tables,
      activity,
      morningEntries,
      releases,
      modules,
      payments,
      exchangeRates,
      cashClosings,
      stockCounts,
      dayClosings,
      adjustmentRequests,
      last,
    ] = await Promise.all([
      tx.servicePoint.findMany({ where, orderBy: { sortOrder: "asc" } }),
      tx.menuItem.findMany({ where }),
      tx.diningTable.findMany({ where, orderBy: { sortOrder: "asc" } }),
      orderSnapshots(tx, establishment.id, { createdAt: { gte: since } }),
      morningEntrySnapshots(tx, establishment.id, { enteredAt: { gte: since } }),
      tableReleaseSnapshots(tx, establishment.id, { releasedAt: { gte: since } }),
      tx.establishmentModule.findMany({ where: { ...where, enabled: true } }),
      paymentSnapshots(tx, establishment.id, { createdAt: { gte: since } }),
      exchangeRateSnapshots(tx, establishment.id, {}, { latest: 10 }),
      cashClosingSnapshots(tx, establishment.id, { declaredAt: { gte: since } }),
      stockCountSnapshots(tx, establishment.id, { countedAt: { gte: since } }),
      dayClosingSnapshots(tx, establishment.id, {}, { latest: 7 }),
      adjustmentRequestSnapshots(tx, establishment.id, { requestedAt: { gte: since } }),
      tx.changeLog.findFirst({ where, orderBy: { seq: "desc" }, select: { seq: true } }),
    ]);
    // D-059 : une dette client peut dater de plusieurs semaines ; ses factures,
    // paiements et demandes accompagnent l'état initial pour pouvoir l'encaisser.
    const owed = await tx.advanceInvoice.findMany({
      where: {
        ...where,
        creditRequestId: { not: null },
        cancelledAt: null,
        paymentStatus: { not: "paid" },
      },
      select: { orderId: true, creditRequestId: true },
    });
    const knownOrders = new Set(activity.orders.map((order) => order.id));
    const olderOrderIds = [...new Set(owed.map((row) => row.orderId))].filter(
      (id) => !knownOrders.has(id),
    );
    const older = olderOrderIds.length
      ? await orderSnapshots(tx, establishment.id, { id: { in: olderOrderIds } })
      : { orders: [], invoices: [] };
    const knownPayments = new Set(payments.map((payment) => payment.id));
    const olderPaymentIds = older.invoices.length
      ? (
          await tx.paymentAllocation.findMany({
            where: { ...where, invoiceId: { in: older.invoices.map((invoice) => invoice.id) } },
            select: { paymentId: true },
          })
        )
          .map((row) => row.paymentId)
          .filter((id) => !knownPayments.has(id))
      : [];
    const olderPayments = olderPaymentIds.length
      ? await paymentSnapshots(tx, establishment.id, { id: { in: [...new Set(olderPaymentIds)] } })
      : [];
    const knownRequests = new Set(adjustmentRequests.map((request) => request.id));
    const olderRequestIds = [
      ...new Set(owed.map((row) => row.creditRequestId).filter((id): id is string => id !== null)),
    ].filter((id) => !knownRequests.has(id));
    const olderRequests = olderRequestIds.length
      ? await adjustmentRequestSnapshots(tx, establishment.id, { id: { in: olderRequestIds } })
      : [];
    const requests = [...adjustmentRequests, ...olderRequests];
    const adjustmentDecisions = await adjustmentDecisionSnapshots(tx, establishment.id, {
      requestId: { in: requests.map((request) => request.id) },
    });
    const customers = (await tx.customer.findMany({ where: { ...where, archivedAt: null } })).map(
      (row) => customerSnapshot(row, establishment.baseCurrency),
    );
    return {
      establishment: {
        id: establishment.id,
        slug: establishment.slug,
        name: establishment.name,
        currency: establishment.baseCurrency,
        timeZone: establishment.timeZone,
      },
      device: { id: device.id, code: device.code },
      servicePoints: servicePoints.map(servicePointSnapshot),
      menuItems: menuItems.map(menuItemSnapshot),
      tables: tables.map(diningTableSnapshot),
      staff: members.map((member) => ({
        id: member.userId,
        establishmentId: establishment.id,
        name: member.user.displayName,
        role: member.role,
      })),
      orders: [...activity.orders, ...older.orders],
      invoices: [...activity.invoices, ...older.invoices],
      morningEntries,
      releases,
      modules: modules.map((entry) => entry.module).sort(),
      payments: [...payments, ...olderPayments],
      exchangeRates,
      cashClosings,
      stockCounts,
      dayClosings,
      adjustmentRequests: requests,
      adjustmentDecisions,
      customers,
      cursor: last?.seq.toString() ?? "0",
    };
  });
}
