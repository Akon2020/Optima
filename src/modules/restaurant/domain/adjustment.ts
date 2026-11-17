import { formatMoney, moneyFromMinor, type Money } from "@/shared/lib/money";

import type { InvoiceBalance } from "./payment";
import type {
  AdjustmentDecision,
  AdjustmentKind,
  AdjustmentRequest,
  PaymentAllocation,
} from "./types";

/**
 * Annulations et remises (RG-CMD-02, RG-VTE-02, RG-ENC-01, D-058) : le
 * serveur demande, le gérant valide. Une facture annulée garde son numéro
 * (RG-DOC-01) et le stock est rétabli de lui-même : les ventes ne comptent
 * que les factures non annulées.
 */

export const MIN_REASON_LENGTH = 3;

export type AdjustmentStatus = "pending" | "approved" | "rejected";

/** Statut d'une demande : la décision, s'il y en a une, fait foi. */
export function adjustmentStatus(
  request: Pick<AdjustmentRequest, "id">,
  decisions: readonly Pick<AdjustmentDecision, "requestId" | "approved">[],
): AdjustmentStatus {
  const decision = decisions.find((entry) => entry.requestId === request.id);
  if (!decision) return "pending";
  return decision.approved ? "approved" : "rejected";
}

/** Demandes encore en attente du gérant. */
export function pendingRequests(
  requests: readonly AdjustmentRequest[],
  decisions: readonly Pick<AdjustmentDecision, "requestId" | "approved">[],
): AdjustmentRequest[] {
  const decided = new Set(decisions.map((decision) => decision.requestId));
  return requests
    .filter((request) => !decided.has(request.id))
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/**
 * Répartit une remise entre les factures, au prorata de leur reste à payer
 * (plus grand reste d'abord pour les unités d'arrondi). Aucune facture ne
 * reçoit plus que son reste.
 */
export function splitDiscount(
  discount: Money,
  invoices: readonly { id: string; remaining: Money }[],
): PaymentAllocation[] {
  const open = invoices.filter((invoice) => invoice.remaining.amountMinor > 0);
  // Répartition en unités entières (francs) quand les montants le permettent :
  // les prix sont arrondis à la centaine de francs (D-042), pas au centime.
  const unit = [discount, ...open.map((invoice) => invoice.remaining)].every(
    (amount) => amount.amountMinor % 100 === 0,
  )
    ? 100
    : 1;
  const total = open.reduce((sum, invoice) => sum + invoice.remaining.amountMinor / unit, 0);
  if (total <= 0 || discount.amountMinor <= 0) return [];
  const target = Math.min(discount.amountMinor / unit, total);
  const shares = open.map((invoice) => {
    const exact = (target * (invoice.remaining.amountMinor / unit)) / total;
    return { id: invoice.id, units: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let left = target - shares.reduce((sum, share) => sum + share.units, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction)) {
    if (left <= 0) break;
    share.units += 1;
    left -= 1;
  }
  return shares
    .filter((share) => share.units > 0)
    .map((share) => ({
      invoiceId: share.id,
      amount: moneyFromMinor(share.units * unit, discount.currency),
    }));
}

export type AdjustmentIssue = { code: string; message: string };

/**
 * Contrôle d'une demande avant de l'enregistrer, puis avant de l'appliquer
 * (le gérant valide plus tard : un paiement a pu arriver entre-temps).
 */
export function adjustmentIssue(input: {
  kind: AdjustmentKind;
  reason: string;
  discount: Money | null;
  balances: readonly Pick<InvoiceBalance, "paid" | "remaining" | "status">[];
  isDayValidated: boolean;
  hasPendingRequest: boolean;
  /** Vente à crédit (D-059) : client choisi, son plafond et son encours. */
  credit?: {
    hasCustomer: boolean;
    isAlreadyCredited: boolean;
    creditLimit: Money | null;
    outstanding: Money;
  };
}): AdjustmentIssue | null {
  if (input.reason.trim().length < MIN_REASON_LENGTH) {
    return {
      code: "REASON_REQUIRED",
      message: "Indiquez le motif de la demande (3 caractères au moins).",
    };
  }
  if (input.isDayValidated) {
    return {
      code: "DAY_VALIDATED",
      message:
        "Cette commande appartient à une journée validée : elle ne se modifie plus (RG-CLO-02).",
    };
  }
  if (input.hasPendingRequest) {
    return {
      code: "REQUEST_PENDING",
      message: "Une demande est déjà en attente du gérant pour cette commande.",
    };
  }
  const active = input.balances.filter((balance) => balance.status !== "cancelled");
  if (active.length === 0) {
    return { code: "ALREADY_CANCELLED", message: "Cette commande est déjà annulée." };
  }
  if (input.kind === "cancel") {
    if (active.some((balance) => balance.paid.amountMinor > 0)) {
      return {
        code: "ALREADY_PAID",
        message:
          "Une facture déjà encaissée ne s'annule pas : le remboursement n'est pas encore géré.",
      };
    }
    return null;
  }
  const remaining = active.reduce((sum, balance) => sum + balance.remaining.amountMinor, 0);
  if (input.kind === "credit") {
    return creditIssue(remaining, input.credit);
  }
  if (!input.discount || input.discount.amountMinor <= 0) {
    return { code: "AMOUNT_REQUIRED", message: "Saisissez le montant de la remise." };
  }
  if (input.discount.amountMinor > remaining) {
    return {
      code: "MORE_THAN_DUE",
      message: "La remise dépasse le reste à payer de la commande.",
    };
  }
  return null;
}

/**
 * Vente à crédit (EF-ENC-03, D-037) : un reste à payer, un client, et le
 * plafond du client respecté (encours + nouveau crédit).
 */
function creditIssue(
  remaining: number,
  credit:
    | {
        hasCustomer: boolean;
        isAlreadyCredited: boolean;
        creditLimit: Money | null;
        outstanding: Money;
      }
    | undefined,
): AdjustmentIssue | null {
  if (remaining <= 0) {
    return {
      code: "NOTHING_DUE",
      message: "Cette commande est déjà réglée : rien à mettre à crédit.",
    };
  }
  if (!credit?.hasCustomer) {
    return {
      code: "CUSTOMER_REQUIRED",
      message: "Choisissez le client ou créez sa fiche (nom et téléphone).",
    };
  }
  if (credit.isAlreadyCredited) {
    return { code: "ALREADY_CREDITED", message: "Cette commande est déjà vendue à crédit." };
  }
  if (
    credit.creditLimit &&
    credit.outstanding.amountMinor + remaining > credit.creditLimit.amountMinor
  ) {
    return {
      code: "CREDIT_LIMIT",
      message: `Le crédit dépasserait le plafond de ce client (${formatMoney(credit.outstanding)} déjà dus sur ${formatMoney(credit.creditLimit)} autorisés).`,
    };
  }
  return null;
}

export const ADJUSTMENT_LABELS: Record<AdjustmentKind, string> = {
  cancel: "Annulation",
  discount: "Remise",
  credit: "Vente à crédit",
};
