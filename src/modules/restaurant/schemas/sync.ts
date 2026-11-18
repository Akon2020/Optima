import "@/shared/lib/zod-config";

import { z } from "zod";

/**
 * Charges utiles des opérations synchronisées du module Restaurant
 * (CLAUDE.md § 3.6). Partagées entre l'appareil, qui les produit, et le
 * serveur, qui les revalide. Le serveur ne fait jamais confiance aux prix ni
 * aux totaux : il les recalcule depuis sa propre base.
 */
const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const optionIds = z.array(z.string().min(1).max(40)).max(12);

/** Groupes d'options d'un élément du menu (D-035, D-060). */
export const optionGroupsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(40),
      name: z.string().trim().min(2).max(40),
      isRequired: z.boolean(),
      isMultiple: z.boolean(),
      options: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            name: z.string().trim().min(1).max(60),
            priceDelta: z.object({
              amountMinor: z.number().int().min(0).max(1_000_000_000),
              currency: z.enum(["CDF", "USD"]),
            }),
          }),
        )
        .min(1)
        .max(12),
    }),
  )
  .max(6);

/** Coordonnées d'une livraison (EF-LIV-01, D-070) ; frais relus côté serveur. */
const deliveryDetails = z.object({
  id: uuid,
  /** Facture des frais (D-071) ; `null` pour une zone gratuite. */
  feeInvoice: z
    .object({ id: uuid, number: z.string().regex(/^FAC-\d{4}-D\d{2,}-\d{6}$/) })
    .nullable(),
  customerName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(24),
  address: z.string().trim().min(3).max(200),
  zoneId: uuid,
  desiredTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

export const orderCreatedSchema = z.object({
  orderId: uuid,
  number: z.string().regex(/^CMD-\d{4}-D\d{2,}-\d{6}$/),
  createdAt: isoDate,
  mode: z.enum(["dine-in", "takeaway", "delivery"]),
  tableId: uuid.nullable(),
  lines: z
    .array(
      z.object({
        menuItemId: uuid,
        quantity: z.number().int().min(1).max(999),
        /** Options choisies (D-060) ; absentes des appareils plus anciens. */
        optionIds: optionIds.optional(),
      }),
    )
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
  /** Livraison (D-070) : exigée en mode « delivery », absente sinon. */
  delivery: deliveryDetails.optional(),
});

/** Zone de livraison (EF-LIV-01, D-070), créée ou modifiée par le gérant. */
export const deliveryZoneSavedSchema = z.object({
  zone: z.object({
    id: uuid,
    name: z.string().trim().min(2).max(60),
    feeMajor: z.number().int().min(0).max(1_000_000),
    sortOrder: z.number().int().min(0).max(10_000),
  }),
});

export const deliveryZoneArchivedSchema = z.object({ zoneId: uuid, isArchived: z.boolean() });

/** EF-LIV-02 : attribution à un livreur. */
export const deliveryAssignedSchema = z.object({
  deliveryId: uuid,
  eventId: uuid,
  courierId: uuid,
  at: isoDate,
});

/** EF-LIV-03, EF-LIV-04 : changement de statut, horodaté. */
export const deliveryStatusChangedSchema = z.object({
  deliveryId: uuid,
  eventId: uuid,
  status: z.enum(["en-route", "delivered", "failed"]),
  note: z.string().trim().max(200).nullable(),
  at: isoDate,
});

export const prepStatusChangedSchema = z.object({
  invoiceId: uuid,
  status: z.enum(["pending", "ready", "served"]),
});

/** EF-PRE-03, D-066 : élément déclaré épuisé (ou remis en vente) pour une journée. */
export const menuItemSoldOutSetSchema = z.object({
  itemId: uuid,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isSoldOut: z.boolean(),
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
    /** Formule et ses composants (D-035, D-060) ; absents des appareils plus anciens. */
    kind: z.enum(["simple", "formula"]).optional(),
    components: z.array(uuid).max(8).optional(),
    optionGroups: optionGroupsSchema.optional(),
  }),
});

/** Options d'un élément, fixées par le gérant (D-060) ; remplacent les précédentes. */
export const menuItemOptionsSetSchema = z.object({
  itemId: uuid,
  optionGroups: optionGroupsSchema,
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

/**
 * Réquisition (D-069). Le genre envoyé par l'appareil n'est qu'une
 * indication : le serveur le recalcule (principale ou complément) d'après
 * les saisies du stock du matin qu'il connaît. Noms et unités sont relus.
 */
export const requisitionCreatedSchema = z.object({
  requisition: z.object({
    id: uuid,
    number: z.string().regex(/^REQ-\d{4}-D\d{2,}-\d{6}$/),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    servicePointId: uuid,
    kind: z.enum(["main", "complement", "return"]),
    lines: z
      .array(z.object({ menuItemId: uuid, quantity: z.number().int().min(1).max(100_000) }))
      .min(1)
      .max(200),
    comment: z.string().trim().max(200).nullable(),
    createdAt: isoDate,
  }),
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

/** Taux « 1 USD = X CDF » ajouté par le gérant (EF-PRX-05, RG-PRX-02, D-042). */
export const exchangeRateAddedSchema = z.object({
  rate: z.object({
    id: uuid,
    rate: z.string().regex(/^\d{1,7}(\.\d{1,6})?$/),
    effectiveAt: isoDate,
  }),
});

/**
 * Paiement reçu (EF-ENC-02, D-032). L'appareil déclare le montant reçu, le
 * taux utilisé, la monnaie rendue et les factures réglées ; le serveur relit
 * le taux et les factures, recalcule la contre-valeur et vérifie la
 * concordance (`checkPaymentConsistency`).
 */
export const paymentRecordedSchema = z.object({
  payment: z.object({
    id: uuid,
    method: z.enum(["cash", "mobile-money"]),
    provider: z.enum(["mpesa", "orange-money", "airtel-money"]).nullable(),
    reference: z.string().trim().max(40).nullable(),
    tendered: z.object({
      amountMinor: z.number().int().positive().max(1_000_000_000_000),
      currency: z.enum(["CDF", "USD"]),
    }),
    rateId: uuid.nullable(),
    changeMinor: z.number().int().min(0).max(1_000_000_000_000),
    allocations: z
      .array(
        z.object({
          invoiceId: uuid,
          amountMinor: z.number().int().positive().max(1_000_000_000_000),
        }),
      )
      .min(1)
      .max(50),
    createdAt: isoDate,
  }),
});

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const comment = z.string().trim().max(300).nullable();

/**
 * Clôture de caisse déclarée (EF-CLO-01, 02). L'appareil envoie les paiements
 * couverts et les montants comptés ; le serveur recalcule l'attendu, la
 * ventilation par point de service et les impayés.
 */
export const cashClosingDeclaredSchema = z.object({
  closing: z.object({
    id: uuid,
    day: dayKey,
    declaredAt: isoDate,
    paymentIds: z.array(uuid).max(1_000),
    counted: z
      .array(
        z.object({
          key: z.string().min(1).max(60),
          amountMinor: z.number().int().min(0).max(1_000_000_000_000),
          currency: z.enum(["CDF", "USD"]),
        }),
      )
      .max(20),
    comment,
  }),
});

/** Comptage de fin de service d'un point de service (EF-CLO-03, D-044). */
export const stockCountedSchema = z.object({
  count: z.object({
    id: uuid,
    day: dayKey,
    servicePointId: uuid,
    countedAt: isoDate,
    lines: z
      .array(
        z.object({
          menuItemId: uuid,
          counted: z.number().int().min(0).max(100_000),
          declaredOut: z.number().int().min(0).max(100_000),
          outReason: z.string().trim().max(160).nullable(),
        }),
      )
      .min(1)
      .max(300),
    comment,
  }),
});

/** Validation de la journée par le gérant (EF-CLO-04, D-039). */
export const dayValidatedSchema = z.object({
  closing: z.object({ id: uuid, day: dayKey, validatedAt: isoDate, comment }),
});

/** Demande d'annulation ou de remise (RG-CMD-02, RG-ENC-01, D-058). */
export const adjustmentRequestedSchema = z.object({
  request: z.object({
    id: uuid,
    kind: z.enum(["cancel", "discount", "credit"]),
    orderId: uuid,
    reason: z.string().trim().min(3).max(160),
    discountMinor: z.number().int().positive().max(1_000_000_000_000).nullable(),
    /** Vente à crédit (D-059) : client débiteur ; absent des appareils plus anciens. */
    customerId: uuid.nullable().default(null),
    requestedAt: isoDate,
  }),
});

/** Décision du gérant ; la répartition d'une remise est refaite par le serveur. */
export const adjustmentDecidedSchema = z.object({
  decision: z.object({
    id: uuid,
    requestId: uuid,
    approved: z.boolean(),
    comment,
    decidedAt: isoDate,
  }),
});

/** Fiche client créée pour une vente à crédit (EF-ENC-03, D-043). */
export const customerCreatedSchema = z.object({
  customer: z.object({
    id: uuid,
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(6).max(30),
    createdAt: isoDate,
  }),
});

/** Plafond de crédit d'un client, fixé par le gérant (D-037) ; `null` : pas de plafond. */
export const customerLimitSetSchema = z.object({
  customerId: uuid,
  creditLimitMinor: z.number().int().positive().max(1_000_000_000_000).nullable(),
});

export const RESTAURANT_OPERATION_TYPES = [
  "restaurant.order.created",
  "restaurant.invoice.prep-status-changed",
  "restaurant.menu-item.created",
  "restaurant.menu-item.sold-out-set",
  "restaurant.morning-stock.entered",
  "restaurant.requisition.created",
  "delivery.zone.saved",
  "delivery.zone.archived",
  "delivery.assigned",
  "delivery.status-changed",
  "restaurant.table.created",
  "restaurant.table.renamed",
  "restaurant.table.archived",
  "restaurant.table.restored",
  "restaurant.table.released",
  "restaurant.exchange-rate.added",
  "restaurant.payment.recorded",
  "restaurant.cash-closing.declared",
  "restaurant.stock.counted",
  "restaurant.day.validated",
  "restaurant.adjustment.requested",
  "restaurant.adjustment.decided",
  "restaurant.customer.created",
  "restaurant.customer.limit-set",
  "restaurant.menu-item.options-set",
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
