import { addMoney, zero, type Currency, type Money } from "@/shared/lib/money";

import type { InvoiceBalance } from "./payment";
import type { AdjustmentDecision, AdjustmentRequest, AdvanceInvoice, Customer } from "./types";

/**
 * Clients et dettes de la vente à crédit (EF-ENC-03, EF-VTE-05, EF-TRE-03,
 * RG-ENC-02, D-037, D-043, D-059). Une dette est une demande de crédit
 * validée par le gérant : le reste à payer de ses factures est dû par le
 * client, et se règle par des encaissements ordinaires.
 */

const PHONE_DIGITS = { min: 9, max: 15 };

/** Numéro normalisé (« +243 99 123 45 67 » → « +243991234567 »), ou `null` s'il est invalide. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < PHONE_DIGITS.min || digits.length > PHONE_DIGITS.max) return null;
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export type CustomerIssue = { code: string; message: string };

/** EF-ENC-03 : le nom et le téléphone du client sont exigés. */
export function customerIssue(
  input: { name: string; phone: string },
  existing: readonly Pick<Customer, "phone">[],
): CustomerIssue | null {
  if (input.name.trim().length < 2) {
    return {
      code: "NAME_REQUIRED",
      message: "Saisissez le nom du client (2 caractères au moins).",
    };
  }
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return {
      code: "INVALID_PHONE",
      message: "Saisissez un numéro de téléphone valide (9 à 15 chiffres).",
    };
  }
  if (existing.some((customer) => customer.phone === phone)) {
    return {
      code: "PHONE_TAKEN",
      message: "Un client a déjà ce numéro : choisissez-le dans la liste.",
    };
  }
  return null;
}

export type CustomerDebt = {
  requestId: string;
  orderId: string;
  customerId: string;
  invoiceIds: string[];
  /** Date de la validation par le gérant : point de départ de l'ancienneté (EF-TRE-03). */
  createdAt: string;
  amount: Money;
  remaining: Money;
};

/** Dettes nées des demandes de crédit validées, avec leur reste à payer. */
export function customerDebts(input: {
  requests: readonly Pick<AdjustmentRequest, "id" | "kind" | "orderId" | "customerId">[];
  decisions: readonly Pick<AdjustmentDecision, "requestId" | "approved" | "decidedAt">[];
  invoices: readonly Pick<AdvanceInvoice, "id" | "creditRequestId" | "credited" | "total">[];
  balances: ReadonlyMap<string, Pick<InvoiceBalance, "remaining">>;
  currency: Currency;
}): CustomerDebt[] {
  const approved = new Map(
    input.decisions
      .filter((decision) => decision.approved)
      .map((decision) => [decision.requestId, decision.decidedAt]),
  );
  return input.requests.flatMap((request) => {
    const decidedAt = approved.get(request.id);
    if (request.kind !== "credit" || !decidedAt || !request.customerId) return [];
    const invoices = input.invoices.filter((invoice) => invoice.creditRequestId === request.id);
    return [
      {
        requestId: request.id,
        orderId: request.orderId,
        customerId: request.customerId,
        invoiceIds: invoices.map((invoice) => invoice.id),
        createdAt: decidedAt,
        amount: invoices.reduce(
          (sum, invoice) => addMoney(sum, invoice.credited ?? zero(input.currency)),
          zero(input.currency),
        ),
        remaining: invoices.reduce(
          (sum, invoice) =>
            addMoney(sum, input.balances.get(invoice.id)?.remaining ?? zero(input.currency)),
          zero(input.currency),
        ),
      },
    ];
  });
}

/** Encours d'un client : somme des restes à payer de ses dettes. */
export function outstandingOf(
  customerId: string,
  debts: readonly CustomerDebt[],
  currency: Currency,
): Money {
  return debts
    .filter((debt) => debt.customerId === customerId)
    .reduce((sum, debt) => addMoney(sum, debt.remaining), zero(currency));
}

/** Ancienneté d'une dette en jours entiers (EF-TRE-03). */
export function debtAgeDays(createdAt: string, nowIso: string): number {
  return Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(createdAt)) / 86_400_000));
}
