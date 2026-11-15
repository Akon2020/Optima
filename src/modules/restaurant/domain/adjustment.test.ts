import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { adjustmentIssue, adjustmentStatus, pendingRequests, splitDiscount } from "./adjustment";
import { invoiceBalances } from "./payment";
import type { AdjustmentRequest } from "./types";

const fc = (major: number) => moneyFromMajor(major, "CDF");

const request = (id: string, requestedAt: string): AdjustmentRequest => ({
  id,
  establishmentId: "e",
  kind: "cancel",
  orderId: "o",
  invoiceIds: ["i"],
  reason: "Erreur de saisie",
  discount: null,
  customerId: null,
  requestedBy: "w1",
  requestedByName: "Amani",
  requestedAt,
  deviceCode: "D01",
});

describe("demandes au gérant (RG-CMD-02, RG-ENC-01)", () => {
  it("la décision fait foi ; sans décision, la demande est en attente", () => {
    const decisions = [
      { requestId: "a", approved: true },
      { requestId: "b", approved: false },
    ];
    expect(adjustmentStatus({ id: "a" }, decisions)).toBe("approved");
    expect(adjustmentStatus({ id: "b" }, decisions)).toBe("rejected");
    expect(adjustmentStatus({ id: "c" }, decisions)).toBe("pending");
    expect(
      pendingRequests(
        [
          request("c", "2026-11-07T20:00:00.000Z"),
          request("a", "2026-11-07T19:00:00.000Z"),
          request("d", "2026-11-07T18:00:00.000Z"),
        ],
        decisions,
      ).map((entry) => entry.id),
    ).toEqual(["d", "c"]);
  });

  it("répartit une remise au prorata, sans dépasser le reste de chaque facture", () => {
    expect(
      splitDiscount(fc(3_000), [
        { id: "counter", remaining: fc(7_000) },
        { id: "kitchen", remaining: fc(15_000) },
        { id: "paid", remaining: fc(0) },
      ]),
    ).toEqual([
      { invoiceId: "counter", amount: fc(955) },
      { invoiceId: "kitchen", amount: fc(2_045) },
    ]);
    const split = splitDiscount(fc(22_000), [
      { id: "counter", remaining: fc(7_000) },
      { id: "kitchen", remaining: fc(15_000) },
    ]);
    expect(split.map((entry) => entry.amount)).toEqual([fc(7_000), fc(15_000)]);
  });

  it("une remise réduit le reste à payer ; une remise totale solde la facture", () => {
    const balances = invoiceBalances(
      [
        { id: "a", total: fc(10_000), paymentStatus: "unpaid", discount: fc(2_000) },
        { id: "b", total: fc(5_000), paymentStatus: "unpaid", discount: fc(5_000) },
      ],
      [],
    );
    expect(balances.get("a")).toMatchObject({ remaining: fc(8_000), status: "unpaid" });
    expect(balances.get("b")).toMatchObject({ remaining: fc(0), status: "paid" });
  });
});

describe("contrôle d'une demande", () => {
  const open = { paid: fc(0), remaining: fc(22_000), status: "unpaid" as const };
  const base = {
    reason: "Client mécontent",
    discount: null,
    balances: [open],
    isDayValidated: false,
    hasPendingRequest: false,
  };

  it("exige un motif et refuse une journée validée ou une demande en double", () => {
    expect(adjustmentIssue({ ...base, kind: "cancel", reason: "" })?.code).toBe("REASON_REQUIRED");
    expect(adjustmentIssue({ ...base, kind: "cancel", isDayValidated: true })?.code).toBe(
      "DAY_VALIDATED",
    );
    expect(adjustmentIssue({ ...base, kind: "cancel", hasPendingRequest: true })?.code).toBe(
      "REQUEST_PENDING",
    );
    expect(adjustmentIssue({ ...base, kind: "cancel" })).toBeNull();
  });

  it("RG-VTE-02 : refuse d'annuler une facture déjà encaissée", () => {
    expect(
      adjustmentIssue({
        ...base,
        kind: "cancel",
        balances: [{ paid: fc(5_000), remaining: fc(17_000), status: "partial" }],
      })?.code,
    ).toBe("ALREADY_PAID");
    expect(
      adjustmentIssue({ ...base, kind: "cancel", balances: [{ ...open, status: "cancelled" }] })
        ?.code,
    ).toBe("ALREADY_CANCELLED");
  });

  it("une remise est positive et ne dépasse pas le reste à payer", () => {
    expect(adjustmentIssue({ ...base, kind: "discount" })?.code).toBe("AMOUNT_REQUIRED");
    expect(adjustmentIssue({ ...base, kind: "discount", discount: fc(30_000) })?.code).toBe(
      "MORE_THAN_DUE",
    );
    expect(adjustmentIssue({ ...base, kind: "discount", discount: fc(2_000) })).toBeNull();
  });

  it("EF-ENC-03, D-037 : un crédit exige un client et respecte son plafond", () => {
    const credit = {
      hasCustomer: true,
      isAlreadyCredited: false,
      creditLimit: null,
      outstanding: fc(0),
    };
    expect(adjustmentIssue({ ...base, kind: "credit", credit })).toBeNull();
    expect(
      adjustmentIssue({ ...base, kind: "credit", credit: { ...credit, hasCustomer: false } })?.code,
    ).toBe("CUSTOMER_REQUIRED");
    expect(
      adjustmentIssue({
        ...base,
        kind: "credit",
        credit: { ...credit, creditLimit: fc(30_000), outstanding: fc(10_000) },
      })?.code,
    ).toBe("CREDIT_LIMIT");
    expect(
      adjustmentIssue({
        ...base,
        kind: "credit",
        credit,
        balances: [{ paid: fc(22_000), remaining: fc(0), status: "paid" }],
      })?.code,
    ).toBe("NOTHING_DUE");
  });
});
