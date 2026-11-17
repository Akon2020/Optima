import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { debtTotals, summarizeDebts, type CreditInvoiceRow } from "./debts";

const NOW = "2026-11-15T12:00:00.000Z";
const row = (overrides: Partial<CreditInvoiceRow>): CreditInvoiceRow => ({
  establishmentId: "e1",
  requestId: "r1",
  customerId: "rose",
  decidedAt: "2026-11-10T18:00:00.000Z",
  currency: "CDF",
  totalMinor: 1_000_000,
  discountMinor: 0,
  paidMinor: 0,
  ...overrides,
});

const names = new Map([
  ["rose", "Maman Rose"],
  ["jean", "Papa Jean"],
]);

describe("dettes clients (EF-PRO-01, EF-TRE-03, D-063)", () => {
  it("le reste d'une dette retire la remise et les remboursements", () => {
    const debts = summarizeDebts({
      establishmentId: "e1",
      currency: "CDF",
      customerNames: names,
      nowIso: NOW,
      rows: [
        // Deux factures de la même dette (comptoir et cuisine).
        row({ totalMinor: 700_000, paidMinor: 200_000 }),
        row({ totalMinor: 1_500_000, discountMinor: 100_000 }),
      ],
    });
    expect(debts.outstanding).toEqual(moneyFromMajor(19_000, "CDF"));
    expect(debts.openDebts).toBe(1);
    expect(debts.debtors).toEqual([
      {
        establishmentId: "e1",
        customerId: "rose",
        name: "Maman Rose",
        remaining: moneyFromMajor(19_000, "CDF"),
        oldestDays: 4,
      },
    ]);
  });

  it("une dette remboursée disparaît ; les débiteurs sont triés par montant", () => {
    const debts = summarizeDebts({
      establishmentId: "e1",
      currency: "CDF",
      customerNames: names,
      nowIso: NOW,
      rows: [
        row({ requestId: "r1", paidMinor: 1_000_000 }),
        row({ requestId: "r2", decidedAt: "2026-11-14T09:00:00.000Z", totalMinor: 300_000 }),
        row({ requestId: "r3", customerId: "jean", totalMinor: 900_000 }),
        row({ establishmentId: "e2", requestId: "r4", customerId: "jean" }),
      ],
    });
    expect(debts.openDebts).toBe(2);
    expect(debts.debtors.map((debtor) => [debtor.name, debtor.oldestDays])).toEqual([
      ["Papa Jean", 4],
      ["Maman Rose", 1],
    ]);
    expect(debts.oldestDays).toBe(4);
  });

  it("sans dette : encours nul, aucune ancienneté ; les totaux ignorent les devises absentes", () => {
    const none = summarizeDebts({
      establishmentId: "e1",
      currency: "CDF",
      customerNames: names,
      nowIso: NOW,
      rows: [],
    });
    expect(none.outstanding.amountMinor).toBe(0);
    expect(none.oldestDays).toBeNull();

    const usd = { outstanding: moneyFromMajor(40, "USD"), debtors: [] };
    const cdf = { outstanding: moneyFromMajor(5_000, "CDF"), debtors: [] };
    expect(debtTotals([none, usd, cdf, cdf]).map((entry) => entry.outstanding)).toEqual([
      moneyFromMajor(40, "USD"),
      moneyFromMajor(10_000, "CDF"),
    ]);
  });
});
