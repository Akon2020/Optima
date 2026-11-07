import Dexie, { type EntityTable } from "dexie";

import type { OutboxOperation } from "@/offline/outbox";
import type { PinVerifier } from "@/offline/pin";

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

export type Counter = { key: string; value: number };
export type Meta = { key: string; value: string };

/**
 * Utilisateur ayant ouvert une session sur cet appareil avec son mot de passe
 * (EF-AUT-05). Le PIN n'est conservé que sous forme de vérificateur.
 */
export type DeviceUserRecord = {
  userId: string;
  name: string;
  role: StaffMember["role"];
  pinVerifier: PinVerifier | null;
  failedPinAttempts: number;
  /** Verrouillé après 5 erreurs : le mot de passe est exigé à nouveau. */
  lockedAt: string | null;
  /** Dernière vérification du mot de passe (actions de gérant, CLAUDE.md § 5.1). */
  passwordVerifiedAt: string;
};

/**
 * Base locale d'un établissement (CLAUDE.md § 3.5 et § 5.5) : une base par
 * établissement, uniquement les données nécessaires au travail du jour.
 */
export class RestaurantDb extends Dexie {
  servicePoints!: EntityTable<ServicePoint, "id">;
  menuItems!: EntityTable<MenuItem, "id">;
  diningTables!: EntityTable<DiningTable, "id">;
  staff!: EntityTable<StaffMember, "id">;
  orders!: EntityTable<Order, "id">;
  invoices!: EntityTable<AdvanceInvoice, "id">;
  morningStockEntries!: EntityTable<MorningStockEntry, "id">;
  tableReleases!: EntityTable<TableRelease, "id">;
  deviceUsers!: EntityTable<DeviceUserRecord, "userId">;
  counters!: EntityTable<Counter, "key">;
  outbox!: EntityTable<OutboxOperation, "id">;
  meta!: EntityTable<Meta, "key">;

  constructor(establishmentId: string) {
    super(`optima-restaurant-${establishmentId}`);
    this.version(1).stores({
      servicePoints: "id, sortOrder",
      menuItems: "id, servicePointId, archivedAt",
      diningTables: "id, sortOrder",
      staff: "id",
      orders: "id, createdAt, waiterId",
      invoices: "id, orderId, servicePointId, createdAt, prepStatus",
      morningStock: "id, [day+menuItemId], day",
      counters: "key",
      outbox: "id, status, createdAt",
      meta: "key",
    });
    // v2 : le stock du matin devient un journal de saisies en ajout seul
    // (corrections tracées, RG-REQ-02). Les anciennes saisies sont reprises.
    this.version(2)
      .stores({
        morningStockEntries: "id, day, [day+menuItemId], servicePointId",
      })
      .upgrade(async (tx) => {
        const legacy = await tx
          .table<{
            id: string;
            establishmentId: string;
            menuItemId: string;
            day: string;
            quantity: number;
            enteredAt: string;
            enteredBy: string;
          }>("morningStock")
          .toArray();
        const items = new Map(
          (await tx.table<MenuItem>("menuItems").toArray()).map((item) => [item.id, item]),
        );
        await tx.table<MorningStockEntry>("morningStockEntries").bulkAdd(
          legacy.map((entry) => ({
            id: entry.id,
            establishmentId: entry.establishmentId,
            day: entry.day,
            servicePointId: items.get(entry.menuItemId)?.servicePointId ?? "",
            menuItemId: entry.menuItemId,
            quantity: entry.quantity,
            proposed: null,
            reason: null,
            replacesId: null,
            enteredAt: entry.enteredAt,
            enteredBy: entry.enteredBy,
            enteredByName: "",
          })),
        );
      });
    // v3 : l'ancienne table, reprise en v2, est supprimée.
    this.version(3).stores({ morningStock: null });
    // v4 : tables archivables (EF-RES-04) et journal des libérations de table.
    this.version(4)
      .stores({ tableReleases: "id, tableId, releasedAt" })
      .upgrade(async (tx) => {
        await tx
          .table<DiningTable>("diningTables")
          .toCollection()
          .modify((table) => {
            table.createdAt ??= "2026-11-01T06:00:00.000Z";
            table.archivedAt ??= null;
          });
      });
    // v5 : utilisateurs de l'appareil (connexion par mot de passe, puis PIN).
    this.version(5).stores({ deviceUsers: "userId" });
  }
}

const instances = new Map<string, RestaurantDb>();

export function getRestaurantDb(establishmentId: string): RestaurantDb {
  let db = instances.get(establishmentId);
  if (!db) {
    db = new RestaurantDb(establishmentId);
    instances.set(establishmentId, db);
  }
  return db;
}
