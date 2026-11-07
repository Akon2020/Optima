import Dexie, { type EntityTable } from "dexie";

import type { OutboxOperation } from "@/offline/outbox";

import type {
  AdvanceInvoice,
  DiningTable,
  MenuItem,
  MorningStock,
  Order,
  ServicePoint,
  StaffMember,
} from "../domain/types";

export type Counter = { key: string; value: number };
export type Meta = { key: string; value: string };

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
  morningStock!: EntityTable<MorningStock, "id">;
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
