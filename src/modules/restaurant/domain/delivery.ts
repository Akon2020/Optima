import { moneyFromMajor, type Currency, type Money } from "@/shared/lib/money";

import { normalizePhone } from "./customers";
import type {
  AdvanceInvoice,
  Delivery,
  DeliveryOutcome,
  DeliveryStatus,
  DeliveryZone,
} from "./types";

/**
 * Livraison (EF-LIV-01 à 04, D-036, D-070 ; mise en œuvre D-071) :
 * - le gérant crée les zones (quartiers) et fixe leurs frais ;
 * - une commande en livraison porte le client, son téléphone, son adresse,
 *   la zone et l'heure souhaitée ; les frais de la zone y sont figés et
 *   facturés à part (facture sans point de service), au profit du restaurant ;
 * - le gérant attribue la livraison à un livreur du personnel ;
 * - en préparation → en route → livrée, ou échouée (motif), chaque
 *   changement horodaté ;
 * - le livreur encaisse à la remise et rend l'argent à son retour (sa caisse
 *   est déclarée à la clôture, comme celle d'un serveur).
 */

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  preparing: "En préparation",
  "en-route": "En route",
  delivered: "Livrée",
  failed: "Échouée",
};

/** EF-LIV-03 : changements de statut permis. Livrée et échouée sont définitives. */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  preparing: ["en-route", "failed"],
  "en-route": ["delivered", "failed"],
  delivered: [],
  failed: [],
};

export const DELIVERY_OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  reusable: "Plats réutilisables, remis en stock",
  lost: "Plats perdus, enregistrés en perte",
};

export const MAX_DELIVERY_FEE_MAJOR = 1_000_000;
export const MIN_FAILURE_REASON_LENGTH = 3;

export type DeliveryIssue = { code: string; message: string; field?: string };

// ─── Zones ──────────────────────────────────────────────────────────────────

/**
 * Contrôle d'une zone (EF-LIV-01, D-070) : nom unique parmi les zones en
 * service, frais en francs entiers, positifs ou nuls (une zone peut être
 * gratuite).
 */
export function zoneIssue(
  input: { name: string; feeMajor: number | null },
  zones: readonly Pick<DeliveryZone, "id" | "name" | "archivedAt">[],
  ignoreId?: string,
): DeliveryIssue | null {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) {
    return {
      code: "INVALID_ZONE_NAME",
      field: "name",
      message: "Le nom de la zone doit contenir de 2 à 60 caractères.",
    };
  }
  const isTaken = zones.some(
    (zone) =>
      zone.id !== ignoreId &&
      zone.archivedAt === null &&
      zone.name.trim().toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
  );
  if (isTaken) {
    return {
      code: "ZONE_NAME_TAKEN",
      field: "name",
      message: `Une zone « ${name} » existe déjà.`,
    };
  }
  const fee = input.feeMajor;
  if (fee === null || !Number.isInteger(fee) || fee < 0 || fee > MAX_DELIVERY_FEE_MAJOR) {
    return {
      code: "INVALID_FEE",
      field: "fee",
      message: "Les frais doivent être un nombre entier de francs, zéro compris.",
    };
  }
  return null;
}

export function zoneFee(feeMajor: number, currency: Currency): Money {
  return moneyFromMajor(feeMajor, currency);
}

// ─── Coordonnées d'une livraison ────────────────────────────────────────────

export type DeliveryDetailsInput = {
  customerName: string;
  phone: string;
  address: string;
  zoneId: string;
  /** « HH:MM », vide : dès que possible. */
  desiredTime: string;
};

export type DeliveryDetails = {
  customerName: string;
  phone: string;
  address: string;
  zone: DeliveryZone;
  desiredTime: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * EF-LIV-01 : nom, téléphone, adresse ou quartier, zone en service et heure
 * souhaitée (facultative). Renvoie les coordonnées nettoyées, ou le premier
 * problème trouvé.
 */
export function checkDeliveryDetails(
  input: DeliveryDetailsInput,
  zones: readonly DeliveryZone[],
): { ok: true; details: DeliveryDetails } | ({ ok: false } & DeliveryIssue) {
  const customerName = input.customerName.trim();
  if (customerName.length < 2 || customerName.length > 80) {
    return {
      ok: false,
      code: "CUSTOMER_NAME_REQUIRED",
      field: "customerName",
      message: "Indiquez le nom du client.",
    };
  }
  const phone = normalizePhone(input.phone);
  if (phone === null) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      field: "phone",
      message: "Le numéro de téléphone n'est pas valide.",
    };
  }
  const address = input.address.trim();
  if (address.length < 3 || address.length > 200) {
    return {
      ok: false,
      code: "ADDRESS_REQUIRED",
      field: "address",
      message: "Indiquez l'adresse ou le quartier de livraison.",
    };
  }
  const zone = zones.find((entry) => entry.id === input.zoneId && entry.archivedAt === null);
  if (!zone) {
    return {
      ok: false,
      code: "ZONE_REQUIRED",
      field: "zoneId",
      message: "Choisissez une zone de livraison en service.",
    };
  }
  const time = input.desiredTime.trim();
  if (time !== "" && !TIME.test(time)) {
    return {
      ok: false,
      code: "INVALID_TIME",
      field: "desiredTime",
      message: "L'heure souhaitée s'écrit HH:MM, par exemple 19:30.",
    };
  }
  return {
    ok: true,
    details: { customerName, phone, address, zone, desiredTime: time === "" ? null : time },
  };
}

// ─── Attribution et statuts ─────────────────────────────────────────────────

/** EF-LIV-02 : seul un livreur du personnel peut recevoir une livraison. */
export function courierIssue(
  delivery: Pick<Delivery, "status">,
  courier: { role: string } | undefined,
): DeliveryIssue | null {
  if (!courier || courier.role !== "courier") {
    return { code: "NOT_A_COURIER", message: "Choisissez un livreur du personnel." };
  }
  if (delivery.status === "delivered" || delivery.status === "failed") {
    return { code: "DELIVERY_CLOSED", message: "Cette livraison est terminée." };
  }
  return null;
}

/**
 * EF-LIV-03, EF-LIV-04 : qui fait avancer une livraison. Le gérant (et le
 * propriétaire) pour toutes ; un livreur seulement pour les siennes, et pas
 * avant d'en avoir été chargé.
 */
export function statusIssue(input: {
  delivery: Pick<Delivery, "status" | "courierId">;
  next: DeliveryStatus;
  role: string;
  userId: string;
  note: string | null;
}): DeliveryIssue | null {
  const { delivery, next, role, userId } = input;
  if (role === "courier" && delivery.courierId !== userId) {
    return {
      code: "NOT_YOUR_DELIVERY",
      message: "Cette livraison est attribuée à un autre livreur.",
    };
  }
  if (role !== "courier" && role !== "manager" && role !== "owner") {
    return { code: "FORBIDDEN", message: "Votre rôle ne permet pas de suivre les livraisons." };
  }
  if (!DELIVERY_TRANSITIONS[delivery.status].includes(next)) {
    return {
      code: "INVALID_TRANSITION",
      message: `Une livraison « ${DELIVERY_STATUS_LABELS[delivery.status].toLowerCase()} » ne peut pas passer « ${DELIVERY_STATUS_LABELS[next].toLowerCase()} ».`,
    };
  }
  if (next === "en-route" && delivery.courierId === null) {
    return { code: "NO_COURIER", message: "Attribuez d'abord la livraison à un livreur." };
  }
  if (next === "failed" && (input.note ?? "").trim().length < MIN_FAILURE_REASON_LENGTH) {
    return { code: "REASON_REQUIRED", message: "Indiquez pourquoi la livraison a échoué." };
  }
  return null;
}

/**
 * Matrice des droits (D-070) : un livreur n'encaisse que les commandes des
 * livraisons qui lui sont attribuées ; un serveur que ses propres ventes.
 */
export function canCollectFor(input: {
  role: string;
  userId: string;
  waiterId: string;
  delivery: Pick<Delivery, "courierId"> | undefined;
}): boolean {
  if (input.role === "courier") return input.delivery?.courierId === input.userId;
  if (input.role === "waiter") return input.waiterId === input.userId;
  return input.role === "manager" || input.role === "owner";
}

/** Livraisons d'un livreur, les plus anciennes d'abord, terminées en dernier. */
export function courierQueue<T extends Pick<Delivery, "courierId" | "status" | "createdAt">>(
  deliveries: readonly T[],
  courierId: string,
): T[] {
  const isOpen = (delivery: T) => delivery.status === "preparing" || delivery.status === "en-route";
  return deliveries
    .filter((delivery) => delivery.courierId === courierId)
    .sort(
      (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.createdAt.localeCompare(b.createdAt),
    );
}

// ─── Livraison échouée (RG-LIV-01) ──────────────────────────────────────────

/**
 * RG-LIV-01 : le gérant tranche une seule fois, sur une livraison échouée,
 * tant que la journée n'est pas validée et qu'aucun paiement n'a été reçu
 * (l'annulation ne rembourse rien).
 */
export function failureSettlementIssue(input: {
  delivery: Pick<Delivery, "status" | "failureOutcome">;
  hasPayment: boolean;
  isDayValidated: boolean;
}): DeliveryIssue | null {
  if (input.delivery.status !== "failed") {
    return { code: "NOT_FAILED", message: "Seule une livraison échouée se règle ainsi." };
  }
  if (input.delivery.failureOutcome) {
    return { code: "ALREADY_SETTLED", message: "Cette livraison échouée est déjà réglée." };
  }
  if (input.isDayValidated) {
    return {
      code: "DAY_VALIDATED",
      message: "La journée de cette commande est validée : corrigez par une écriture d'ajustement.",
    };
  }
  if (input.hasPayment) {
    return {
      code: "DELIVERY_PAID",
      message:
        "Un paiement a été reçu pour cette commande : réglez-le avant d'annuler la livraison.",
    };
  }
  return null;
}

/**
 * Quantités perdues par élément (RG-LIV-01) : les lignes des factures des
 * livraisons échouées déclarées perdues. Ces factures sont annulées (elles
 * ne comptent plus comme vendues) mais les plats ne reviennent pas en stock :
 * on les retire du stock disponible et du stock attendu.
 */
export function lostQuantities(
  deliveries: readonly Pick<Delivery, "orderId" | "failureOutcome">[],
  invoices: readonly (Pick<AdvanceInvoice, "orderId"> & {
    lines: readonly { menuItemId: string; quantity: number }[];
  })[],
): Map<string, number> {
  const lostOrders = new Set(
    deliveries.filter((delivery) => delivery.failureOutcome === "lost").map((d) => d.orderId),
  );
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    if (!lostOrders.has(invoice.orderId)) continue;
    for (const line of invoice.lines) {
      totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.quantity);
    }
  }
  return totals;
}
