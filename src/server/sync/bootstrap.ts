import { businessDayStart } from "@/modules/restaurant/domain/business-day";
import type {
  AdvanceInvoice,
  DiningTable,
  MenuItem,
  MorningStockEntry,
  Order,
  ServicePoint,
  StaffMember,
  TableRelease,
} from "@/modules/restaurant/domain/types";

import type { Db } from "../db/context";
import { withContext } from "../db/context";
import {
  diningTableSnapshot,
  menuItemSnapshot,
  morningEntrySnapshots,
  orderSnapshots,
  servicePointSnapshot,
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
    const [servicePoints, menuItems, tables, activity, morningEntries, releases, last] =
      await Promise.all([
        tx.servicePoint.findMany({ where, orderBy: { sortOrder: "asc" } }),
        tx.menuItem.findMany({ where }),
        tx.diningTable.findMany({ where, orderBy: { sortOrder: "asc" } }),
        orderSnapshots(tx, establishment.id, { createdAt: { gte: since } }),
        morningEntrySnapshots(tx, establishment.id, { enteredAt: { gte: since } }),
        tableReleaseSnapshots(tx, establishment.id, { releasedAt: { gte: since } }),
        tx.changeLog.findFirst({ where, orderBy: { seq: "desc" }, select: { seq: true } }),
      ]);
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
      orders: activity.orders,
      invoices: activity.invoices,
      morningEntries,
      releases,
      cursor: last?.seq.toString() ?? "0",
    };
  });
}
