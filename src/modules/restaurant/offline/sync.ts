import type { OutboxOperation } from "@/offline/outbox";

import type {
  AdvanceInvoice,
  DiningTable,
  MenuItem,
  MorningStockEntry,
  Order,
  ServicePoint,
  StaffMember,
  TableRelease,
} from "../domain/types";
import type { RestaurantDb } from "./db";
import {
  applyStaffMember,
  getCursor,
  pruneDeviceUsers,
  saveCursor,
  type DeviceInfo,
  type StaffMemberChange,
} from "./device";

/**
 * Client de synchronisation (patron outbox, CLAUDE.md § 3.6, EF-OFF-01 à 04) :
 * envoi des opérations en attente, puis réception des changements des autres
 * appareils depuis le dernier curseur.
 */
export class DeviceRevokedError extends Error {
  override name = "DeviceRevokedError";
}

export class OfflineError extends Error {
  override name = "OfflineError";
}

export type Bootstrap = {
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

type Change = { seq: string; entity: string; entityId: string; data: unknown };

const PUSH_BATCH = 200;

async function request<T>(device: DeviceInfo, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Device ${device.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new OfflineError("Serveur injoignable.");
  }
  if (response.status === 401) throw new DeviceRevokedError("Appareil révoqué.");
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Erreur ${response.status} du serveur.`);
  }
  return (await response.json()) as T;
}

/** Remplace les données de référence et fusionne l'activité récente. */
export async function applyBootstrap(db: RestaurantDb, snapshot: Bootstrap): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.servicePoints,
      db.menuItems,
      db.diningTables,
      db.staff,
      db.orders,
      db.invoices,
      db.morningStockEntries,
      db.tableReleases,
      db.deviceUsers,
      db.meta,
    ],
    async () => {
      await db.servicePoints.bulkPut(snapshot.servicePoints);
      await db.menuItems.bulkPut(snapshot.menuItems);
      await db.diningTables.bulkPut(snapshot.tables);
      await db.staff.clear();
      await db.staff.bulkPut(snapshot.staff);
      // Un membre suspendu pendant que l'appareil était éteint perd son accès ici.
      await pruneDeviceUsers(db, snapshot.staff);
      await db.orders.bulkPut(snapshot.orders);
      await db.invoices.bulkPut(snapshot.invoices);
      await db.morningStockEntries.bulkPut(snapshot.morningEntries);
      await db.tableReleases.bulkPut(snapshot.releases);
      if (BigInt(snapshot.cursor) > BigInt(await getCursor(db))) {
        await saveCursor(db, snapshot.cursor);
      }
    },
  );
}

export async function fetchBootstrap(device: DeviceInfo): Promise<Bootstrap> {
  return request<Bootstrap>(device, "/api/sync/bootstrap");
}

/** Applique un changement reçu : les enregistrements sont complets (voir snapshots serveur). */
export async function applyChange(db: RestaurantDb, change: Change): Promise<void> {
  switch (change.entity) {
    case "order":
      await db.orders.put(change.data as Order);
      break;
    case "advance_invoice":
      await db.invoices.put(change.data as AdvanceInvoice);
      break;
    case "menu_item":
      await db.menuItems.put(change.data as MenuItem);
      break;
    case "dining_table":
      await db.diningTables.put(change.data as DiningTable);
      break;
    case "table_release":
      await db.tableReleases.put(change.data as TableRelease);
      break;
    case "morning_stock_entry":
      await db.morningStockEntries.put(change.data as MorningStockEntry);
      break;
    case "staff_member":
      await applyStaffMember(db, change.data as StaffMemberChange);
      break;
    default:
      // Entité d'un module plus récent : ignorée par cette version de l'appareil.
      break;
  }
}

type PushResult =
  | { id: string; status: "accepted" | "duplicate" }
  | { id: string; status: "rejected"; code: string; message: string }
  | { id: string; status: "retry"; message: string };

/** Envoie les opérations en attente, par lots de 200 au plus (RG-OFF-01 : idempotent). */
export async function pushPending(db: RestaurantDb, device: DeviceInfo): Promise<number> {
  let sent = 0;
  for (;;) {
    const pending: OutboxOperation[] = await db.outbox
      .where("status")
      .equals("pending")
      .sortBy("createdAt");
    const batch = pending.slice(0, PUSH_BATCH);
    if (batch.length === 0) return sent;
    const { results } = await request<{ results: PushResult[] }>(device, "/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ operations: batch }),
    });
    let progressed = false;
    for (const result of results) {
      if (result.status === "accepted" || result.status === "duplicate") {
        await db.outbox.update(result.id, { status: result.status });
        progressed = true;
      } else if (result.status === "rejected") {
        await db.outbox.update(result.id, {
          status: "rejected",
          rejection: { code: result.code, message: result.message },
        });
        progressed = true;
      }
    }
    sent += batch.length;
    // Rien n'a avancé (erreurs temporaires) : nouvel essai au prochain cycle.
    if (!progressed || batch.length < PUSH_BATCH) return sent;
  }
}

/** Reçoit les changements depuis le curseur, page par page. */
export async function pullChanges(db: RestaurantDb, device: DeviceInfo): Promise<number> {
  let received = 0;
  for (;;) {
    const cursor = await getCursor(db);
    const page = await request<{ changes: Change[]; cursor: string; hasMore: boolean }>(
      device,
      `/api/sync/pull?cursor=${encodeURIComponent(cursor)}`,
    );
    await db.transaction(
      "rw",
      [
        db.orders,
        db.invoices,
        db.menuItems,
        db.diningTables,
        db.tableReleases,
        db.morningStockEntries,
        db.meta,
      ],
      async () => {
        for (const change of page.changes) await applyChange(db, change);
        await saveCursor(db, page.cursor);
      },
    );
    received += page.changes.length;
    if (!page.hasMore) return received;
  }
}

export async function syncOnce(
  db: RestaurantDb,
  device: DeviceInfo,
): Promise<{ sent: number; received: number }> {
  const sent = await pushPending(db, device);
  const received = await pullChanges(db, device);
  return { sent, received };
}
