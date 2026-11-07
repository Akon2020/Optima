import { z } from "zod";

/**
 * Charges utiles des opérations synchronisées du module Restaurant
 * (CLAUDE.md § 3.6). Partagées entre l'appareil, qui les produit, et le
 * serveur, qui les revalide. Le serveur ne fait jamais confiance aux prix ni
 * aux totaux : il les recalcule depuis sa propre base.
 */
const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

export const orderCreatedSchema = z.object({
  orderId: uuid,
  number: z.string().regex(/^CMD-\d{4}-D\d{2,}-\d{6}$/),
  createdAt: isoDate,
  mode: z.enum(["dine-in", "takeaway", "delivery"]),
  tableId: uuid.nullable(),
  lines: z
    .array(z.object({ menuItemId: uuid, quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(100),
  invoices: z
    .array(
      z.object({
        id: uuid,
        number: z.string().regex(/^FAC-\d{4}-D\d{2,}-\d{6}$/),
        servicePointId: uuid,
      }),
    )
    .min(1)
    .max(10),
});

export const prepStatusChangedSchema = z.object({
  invoiceId: uuid,
  status: z.enum(["pending", "ready", "served"]),
});

export const menuItemCreatedSchema = z.object({
  item: z.object({
    id: uuid,
    servicePointId: uuid,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(160),
    category: z.string().trim().max(40),
    unit: z.enum(["bottle", "dish", "piece"]),
    price: z
      .object({ amountMinor: z.number().int().positive(), currency: z.enum(["CDF", "USD"]) })
      .nullable(),
  }),
});

export const morningStockEnteredSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicePointId: uuid,
  entries: z
    .array(
      z.object({
        id: uuid,
        menuItemId: uuid,
        quantity: z.number().int().min(0).max(100_000),
        proposed: z.number().int().min(0).nullable(),
        reason: z.string().trim().max(160).nullable(),
        replacesId: uuid.nullable(),
        enteredAt: isoDate,
      }),
    )
    .min(1)
    .max(200),
});

export const tableCreatedSchema = z.object({
  table: z.object({
    id: uuid,
    label: z.string().trim().min(1).max(24),
    sortOrder: z.number().int().min(0),
  }),
});

export const tableRenamedSchema = z.object({
  tableId: uuid,
  after: z.string().trim().min(1).max(24),
});

export const tableArchivedSchema = z.object({ tableId: uuid });

export const tableReleasedSchema = z.object({
  release: z.object({ id: uuid, tableId: uuid, releasedAt: isoDate }),
});

export const RESTAURANT_OPERATION_TYPES = [
  "restaurant.order.created",
  "restaurant.invoice.prep-status-changed",
  "restaurant.menu-item.created",
  "restaurant.morning-stock.entered",
  "restaurant.table.created",
  "restaurant.table.renamed",
  "restaurant.table.archived",
  "restaurant.table.restored",
  "restaurant.table.released",
] as const;

export type RestaurantOperationType = (typeof RESTAURANT_OPERATION_TYPES)[number];

/** Enveloppe commune d'une opération (RG-OFF-01 : `id` unique créé sur l'appareil). */
export const operationEnvelopeSchema = z.object({
  id: uuid,
  type: z.string().min(1).max(80),
  payload: z.unknown(),
  establishmentId: z.string().min(1),
  userId: z.string().min(1),
  deviceId: z.string().min(1),
  createdAt: isoDate,
  schemaVersion: z.number().int().min(1),
});

export type OperationEnvelope = z.infer<typeof operationEnvelopeSchema>;

export const MAX_OPERATIONS_PER_PUSH = 200;
