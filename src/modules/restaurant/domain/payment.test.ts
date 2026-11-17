import { describe, expect, it } from "vitest";

import { moneyFromMajor, moneyFromMinor } from "@/shared/lib/money";

import {
  allocatePayment,
  checkPaymentConsistency,
  collectedAmount,
  combinedPaymentStatus,
  conversionTolerance,
  convertMoney,
  holdingsByMode,
  invoiceBalances,
  minimumTendered,
  parseRate,
  remainingDue,
  settlePayment,
} from "./payment";
import type { Payment } from "./types";

const fc = (major: number) => moneyFromMajor(major, "CDF");
const usd = (major: number) => moneyFromMajor(major, "USD");

describe("taux du dollar (EF-PRX-05, D-042)", () => {
  it("lit un taux saisi à la française", () => {
    expect(parseRate("2850")).toMatchObject({ ok: true, rate: "2850" });
    expect(parseRate("2 850")).toMatchObject({ ok: true, rate: "2850" });
    expect(parseRate("2850,50")).toMatchObject({ ok: true, rate: "2850.5" });
    expect(parseRate("0002850.000000")).toMatchObject({ ok: true, rate: "2850" });
  });

  it("refuse un taux illisible, nul ou trop précis", () => {
    expect(parseRate("abc").ok).toBe(false);
    expect(parseRate("0").ok).toBe(false);
    expect(parseRate("2850.1234567").ok).toBe(false);
    expect(parseRate("-2850").ok).toBe(false);
    expect(parseRate("2000000").ok).toBe(false);
  });

  it("convertit sans flottant, dans les deux sens", () => {
    expect(convertMoney(usd(20), "CDF", "2850")).toEqual(fc(57_000));
    expect(convertMoney(usd(0.01), "CDF", "2850.5")).toEqual(moneyFromMinor(2_851, "CDF"));
    expect(convertMoney(fc(57_000), "USD", "2850")).toEqual(usd(20));
    expect(convertMoney(fc(45_000), "CDF", "2850")).toEqual(fc(45_000));
  });

  it("calcule le montant minimal à demander en dollars", () => {
    expect(minimumTendered(fc(45_000), "USD", "2850")).toEqual(usd(15.79));
    expect(minimumTendered(fc(57_000), "USD", "2850")).toEqual(usd(20));
    expect(conversionTolerance("USD", "CDF", "2850")).toEqual(fc(28.5));
  });
});

describe("règlement d'un montant reçu (EF-ENC-02)", () => {
  it("rend la monnaie en francs sur des espèces en dollars", () => {
    const result = settlePayment({
      due: fc(45_000),
      tendered: usd(20),
      method: "cash",
      rate: "2850",
    });
    expect(result).toEqual({
      ok: true,
      baseAmount: fc(57_000),
      change: fc(12_000),
      applied: fc(45_000),
    });
  });

  it("accepte un paiement partiel", () => {
    const result = settlePayment({
      due: fc(45_000),
      tendered: fc(20_000),
      method: "cash",
      rate: null,
    });
    expect(result).toMatchObject({ ok: true, applied: fc(20_000), change: fc(0) });
  });

  it("refuse la monnaie sur Mobile Money, sauf l'arrondi de conversion", () => {
    expect(
      settlePayment({ due: fc(45_000), tendered: fc(50_000), method: "mobile-money", rate: null }),
    ).toMatchObject({ ok: false, code: "MORE_THAN_DUE" });
    // 15,79 $ × 2 850 = 45 001,50 FC : l'écart d'arrondi n'est pas un trop-perçu.
    expect(
      settlePayment({
        due: fc(45_000),
        tendered: usd(15.79),
        method: "mobile-money",
        rate: "2850",
      }),
    ).toMatchObject({ ok: true, applied: fc(45_000), change: fc(0) });
  });

  it("exige un taux pour les dollars et un montant positif", () => {
    expect(
      settlePayment({ due: fc(45_000), tendered: usd(20), method: "cash", rate: null }),
    ).toMatchObject({ ok: false, code: "RATE_REQUIRED" });
    expect(
      settlePayment({ due: fc(45_000), tendered: fc(0), method: "cash", rate: null }),
    ).toMatchObject({ ok: false, code: "AMOUNT_REQUIRED" });
    expect(
      settlePayment({ due: fc(0), tendered: fc(1_000), method: "cash", rate: null }),
    ).toMatchObject({ ok: false, code: "NOTHING_DUE" });
  });
});

describe("contrôle serveur d'un paiement", () => {
  const base = {
    method: "cash" as const,
    provider: null,
    tendered: usd(20),
    baseAmount: fc(57_000),
    change: fc(12_000),
    allocated: fc(45_000),
    rate: "2850",
  };

  it("accepte un paiement cohérent", () => {
    expect(checkPaymentConsistency(base)).toBeNull();
    expect(
      checkPaymentConsistency({
        ...base,
        method: "mobile-money",
        provider: "mpesa",
        tendered: usd(15.79),
        baseAmount: fc(45_001.5),
        change: fc(0),
      }),
    ).toBeNull();
  });

  it("refuse des montants qui ne concordent pas", () => {
    expect(checkPaymentConsistency({ ...base, allocated: fc(50_000) })).not.toBeNull();
    expect(checkPaymentConsistency({ ...base, change: fc(-1) })).not.toBeNull();
    expect(
      checkPaymentConsistency({ ...base, method: "mobile-money", provider: "mpesa" }),
    ).not.toBeNull();
    expect(
      checkPaymentConsistency({ ...base, method: "mobile-money", provider: null, change: fc(0) }),
    ).not.toBeNull();
  });
});

describe("affectation et soldes des factures (RG-OFF-03)", () => {
  const invoices = [
    { id: "a", total: fc(30_000), paymentStatus: "unpaid" as const },
    { id: "b", total: fc(15_000), paymentStatus: "unpaid" as const },
    { id: "c", total: fc(5_000), paymentStatus: "cancelled" as const },
  ];

  it("solde les factures dans l'ordre", () => {
    const allocations = allocatePayment(fc(35_000), [
      { id: "a", remaining: fc(30_000) },
      { id: "b", remaining: fc(15_000) },
    ]);
    expect(allocations).toEqual([
      { invoiceId: "a", amount: fc(30_000) },
      { invoiceId: "b", amount: fc(5_000) },
    ]);
  });

  it("additionne les paiements et signale un trop-perçu", () => {
    const balances = invoiceBalances(invoices, [
      { allocations: [{ invoiceId: "a", amount: fc(30_000) }] },
      {
        allocations: [
          { invoiceId: "a", amount: fc(10_000) },
          { invoiceId: "b", amount: fc(5_000) },
        ],
      },
    ]);
    expect(balances.get("a")).toMatchObject({
      status: "paid",
      overpaid: fc(10_000),
      remaining: fc(0),
    });
    expect(balances.get("b")).toMatchObject({ status: "partial", remaining: fc(10_000) });
    expect(balances.get("c")).toMatchObject({ status: "cancelled", remaining: fc(0) });
    expect(remainingDue(["a", "b", "c"], balances, "CDF")).toEqual(fc(10_000));
  });

  it("donne le statut d'un ensemble de factures", () => {
    expect(combinedPaymentStatus(["paid", "paid", "cancelled"])).toBe("paid");
    expect(combinedPaymentStatus(["paid", "unpaid"])).toBe("partial");
    expect(combinedPaymentStatus(["unpaid", "unpaid"])).toBe("unpaid");
    expect(combinedPaymentStatus(["cancelled"])).toBe("cancelled");
  });
});

describe("argent détenu par mode de paiement (EF-ENC-04)", () => {
  const payment = (
    overrides: Partial<Payment>,
  ): Pick<Payment, "method" | "provider" | "tendered" | "change" | "baseAmount"> => ({
    method: "cash",
    provider: null,
    tendered: fc(10_000),
    change: fc(0),
    baseAmount: fc(10_000),
    ...overrides,
  });

  it("retire la monnaie rendue des espèces en francs", () => {
    const payments = [
      payment({ tendered: fc(50_000), baseAmount: fc(50_000) }),
      payment({ tendered: usd(20), baseAmount: fc(57_000), change: fc(12_000) }),
      payment({
        method: "mobile-money",
        provider: "mpesa",
        tendered: fc(8_000),
        baseAmount: fc(8_000),
      }),
    ];
    expect(holdingsByMode(payments, "CDF").map((bucket) => [bucket.key, bucket.amount])).toEqual([
      ["cash::CDF", fc(38_000)],
      ["cash::USD", usd(20)],
      ["mobile-money:mpesa:CDF", fc(8_000)],
    ]);
    expect(collectedAmount(payments, "CDF")).toEqual(fc(103_000));
  });
});
