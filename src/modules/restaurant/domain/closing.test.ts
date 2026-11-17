import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  cashClosingVariances,
  collectedByServicePoint,
  collectorsWithUnclosedPayments,
  computeCashVariance,
  computeExpectedStock,
  dayClosingIssues,
  expectedCashLines,
  latestStockCounts,
  stockLineVariance,
  totalsByCurrency,
  unclosedPayments,
  unpaidInvoiceIds,
  validateCashClosing,
  validateStockCount,
} from "./closing";
import { invoiceBalances } from "./payment";
import type { Payment, StockCount, StockCountLine } from "./types";

const fc = (major: number) => moneyFromMajor(major, "CDF");
const usd = (major: number) => moneyFromMajor(major, "USD");

describe("clôture de service", () => {
  it("EF-CLO-02 : un manquant est un écart négatif et exige un commentaire", () => {
    const result = computeCashVariance(
      moneyFromMajor(120000, "CDF"),
      moneyFromMajor(115000, "CDF"),
    );
    expect(result.kind).toBe("shortage");
    expect(result.variance.amountMinor).toBe(-500_000);
    expect(result.requiresComment).toBe(true);
  });

  it("EF-CLO-02 : un excédent est un écart positif", () => {
    const result = computeCashVariance(moneyFromMajor(1000, "CDF"), moneyFromMajor(1500, "CDF"));
    expect(result.kind).toBe("surplus");
  });

  it("EF-CLO-02 : une caisse juste n'exige pas de commentaire", () => {
    const result = computeCashVariance(moneyFromMajor(5000, "CDF"), moneyFromMajor(5000, "CDF"));
    expect(result).toMatchObject({ kind: "balanced", requiresComment: false });
  });

  it("EF-CLO-03 : stock attendu = matin + réquisitions − ventes", () => {
    expect(computeExpectedStock({ morning: 24, requisitioned: 12, sold: 30 })).toBe(6);
  });
});

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "p",
    establishmentId: "e",
    method: "cash",
    provider: null,
    reference: null,
    tendered: fc(10_000),
    rate: null,
    baseAmount: fc(10_000),
    change: fc(0),
    allocations: [],
    collectedBy: "w1",
    collectedByName: "Amani",
    deviceCode: "D01",
    createdAt: "2026-11-14T18:00:00.000Z",
    ...overrides,
  };
}

describe("clôture de caisse d'une personne (EF-CLO-01, D-032)", () => {
  const payments = [
    payment({
      id: "p1",
      tendered: fc(30_000),
      baseAmount: fc(30_000),
      change: fc(2_000),
      allocations: [
        { invoiceId: "i-counter", amount: fc(7_000) },
        { invoiceId: "i-kitchen", amount: fc(21_000) },
      ],
    }),
    payment({
      id: "p2",
      tendered: usd(10),
      baseAmount: fc(28_500),
      change: fc(500),
      allocations: [{ invoiceId: "i-grill", amount: fc(28_000) }],
    }),
    payment({ id: "p3", collectedBy: "w2", collectedByName: "Neema" }),
  ];

  it("ne reprend que les paiements de la personne qui ne sont dans aucune clôture", () => {
    expect(unclosedPayments(payments, [{ paymentIds: ["p1"] }], "w1").map((p) => p.id)).toEqual([
      "p2",
    ]);
    expect(collectorsWithUnclosedPayments(payments, [{ paymentIds: ["p1", "p2"] }])).toEqual([
      { userId: "w2", name: "Neema", payments: 1 },
    ]);
  });

  it("calcule l'attendu par mode de paiement, monnaie rendue déduite", () => {
    const own = unclosedPayments(payments, [], "w1");
    expect(expectedCashLines(own, "CDF").map((line) => [line.key, line.expected])).toEqual([
      ["cash::CDF", fc(27_500)],
      ["cash::USD", usd(10)],
    ]);
  });

  it("ventile l'argent encaissé par point de service", () => {
    const invoices = [
      { id: "i-counter", servicePointId: "counter" },
      { id: "i-kitchen", servicePointId: "kitchen" },
      { id: "i-grill", servicePointId: "grill" },
    ];
    expect(collectedByServicePoint(payments, invoices, "CDF")).toEqual([
      { servicePointId: "counter", amount: fc(7_000) },
      { servicePointId: "kitchen", amount: fc(21_000) },
      { servicePointId: "grill", amount: fc(28_000) },
    ]);
  });

  it("RG-ENC-02 : relève les factures impayées du serveur", () => {
    const invoices = [
      { id: "a", waiterId: "w1", total: fc(10_000), paymentStatus: "unpaid" as const },
      { id: "b", waiterId: "w1", total: fc(5_000), paymentStatus: "unpaid" as const },
      { id: "c", waiterId: "w2", total: fc(5_000), paymentStatus: "unpaid" as const },
      { id: "d", waiterId: "w1", total: fc(5_000), paymentStatus: "cancelled" as const },
      // Convertie en dette client (D-059) : elle n'est plus au nom du serveur.
      {
        id: "e",
        waiterId: "w1",
        total: fc(5_000),
        paymentStatus: "unpaid" as const,
        creditRequestId: "r1",
      },
    ];
    const balances = invoiceBalances(invoices, [
      { allocations: [{ invoiceId: "a", amount: fc(10_000) }] },
    ]);
    expect(unpaidInvoiceIds(invoices, balances, "w1")).toEqual(["b"]);
  });

  it("EF-CLO-02 : exige un commentaire pour tout écart, mode par mode", () => {
    const lines = [
      { key: "cash::CDF", expected: fc(27_500), counted: fc(25_000) },
      { key: "cash::USD", expected: usd(10), counted: usd(10) },
    ];
    expect(cashClosingVariances(lines).map((line) => line.kind)).toEqual(["shortage", "balanced"]);
    expect(validateCashClosing({ lines, unpaidInvoiceIds: [], comment: "" })).toMatchObject({
      code: "COMMENT_REQUIRED",
    });
    expect(
      validateCashClosing({ lines, unpaidInvoiceIds: [], comment: "Billet de 5 000 perdu" }),
    ).toBeNull();
    expect(validateCashClosing({ lines: [], unpaidInvoiceIds: [], comment: "" })).toMatchObject({
      code: "NOTHING_TO_CLOSE",
    });
    expect(totalsByCurrency(lines)).toEqual([
      { currency: "CDF", expected: fc(27_500), counted: fc(25_000) },
      { currency: "USD", expected: usd(10), counted: usd(10) },
    ]);
  });
});

describe("comptage du stock (EF-CLO-03, D-044)", () => {
  const line = (overrides: Partial<StockCountLine>): StockCountLine => ({
    menuItemId: "item",
    name: "Primus",
    unit: "bottle",
    morning: 48,
    sold: 30,
    declaredOut: 0,
    outReason: null,
    counted: 18,
    ...overrides,
  });

  it("retire les sorties déclarées avant de calculer l'écart", () => {
    expect(stockLineVariance(line({}))).toBe(0);
    expect(stockLineVariance(line({ declaredOut: 2, counted: 16 }))).toBe(0);
    expect(stockLineVariance(line({ counted: 15 }))).toBe(-3);
    expect(stockLineVariance(line({ morning: null }))).toBeNull();
  });

  it("exige un motif pour les sorties et un commentaire pour les écarts", () => {
    expect(
      validateStockCount({ lines: [line({ declaredOut: 2, counted: 16 })], comment: "" }),
    ).toEqual([expect.objectContaining({ code: "OUT_REASON_REQUIRED" })]);
    expect(validateStockCount({ lines: [line({ counted: 15 })], comment: "" })).toEqual([
      expect.objectContaining({ code: "COMMENT_REQUIRED" }),
    ]);
    expect(
      validateStockCount({
        lines: [line({ declaredOut: 2, outReason: "Casse", counted: 16 })],
        comment: "",
      }),
    ).toEqual([]);
    expect(validateStockCount({ lines: [line({ counted: -1 })], comment: "x" })).toEqual([
      expect.objectContaining({ code: "INVALID_QUANTITY" }),
    ]);
  });

  it("garde le comptage le plus récent de chaque point", () => {
    const count = (id: string, countedAt: string, day = "2026-11-14"): StockCount => ({
      id,
      establishmentId: "e",
      day,
      servicePointId: "counter",
      countedAt,
      countedBy: "m",
      countedByName: "Gérant",
      lines: [],
      comment: null,
    });
    const latest = latestStockCounts(
      [
        count("a", "2026-11-14T21:00:00.000Z"),
        count("b", "2026-11-14T22:00:00.000Z"),
        count("c", "2026-11-15T22:00:00.000Z", "2026-11-15"),
      ],
      "2026-11-14",
    );
    expect(latest.get("counter")?.id).toBe("b");
  });
});

describe("validation de la journée (EF-CLO-04, RG-CLO-01, RG-CLO-03, RG-REQ-03)", () => {
  const ready = {
    isAlreadyValidated: false,
    pointsMissingMorningStock: [],
    pointsNotCounted: [],
    undeclaredCollectors: [],
    pendingOperations: 0,
    isOnline: true,
  };

  it("n'oppose rien quand tout est déclaré, compté et envoyé", () => {
    expect(dayClosingIssues(ready)).toEqual([]);
  });

  it("nomme ce qui manque", () => {
    const issues = dayClosingIssues({
      ...ready,
      pointsMissingMorningStock: ["Grillade"],
      pointsNotCounted: ["Comptoir"],
      undeclaredCollectors: ["Amani"],
      pendingOperations: 2,
      isOnline: false,
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      "MORNING_STOCK_MISSING",
      "STOCK_NOT_COUNTED",
      "CASH_NOT_DECLARED",
      "PENDING_OPERATIONS",
      "OFFLINE",
    ]);
    expect(issues[2]?.message).toContain("Amani");
  });

  it("RG-CLO-02 : une journée validée ne se valide pas deux fois", () => {
    expect(dayClosingIssues({ ...ready, isAlreadyValidated: true })).toEqual([
      expect.objectContaining({ code: "ALREADY_VALIDATED" }),
    ]);
  });
});
