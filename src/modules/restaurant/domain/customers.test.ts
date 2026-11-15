import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  customerDebts,
  customerIssue,
  debtAgeDays,
  normalizePhone,
  outstandingOf,
} from "./customers";
import { invoiceBalances } from "./payment";

const fc = (major: number) => moneyFromMajor(major, "CDF");

describe("fiches clients (EF-ENC-03, D-043)", () => {
  it("normalise le téléphone et refuse un numéro invalide", () => {
    expect(normalizePhone("+243 99 123 45 67")).toBe("+243991234567");
    expect(normalizePhone("0991-234-567")).toBe("0991234567");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("appelle-moi")).toBeNull();
  });

  it("exige un nom, un téléphone valide et unique", () => {
    expect(customerIssue({ name: "", phone: "0991234567" }, [])?.code).toBe("NAME_REQUIRED");
    expect(customerIssue({ name: "Maman Rose", phone: "99" }, [])?.code).toBe("INVALID_PHONE");
    expect(
      customerIssue({ name: "Maman Rose", phone: "099 123 4567" }, [{ phone: "0991234567" }])?.code,
    ).toBe("PHONE_TAKEN");
    expect(customerIssue({ name: "Maman Rose", phone: "0991234567" }, [])).toBeNull();
  });
});

describe("dettes clients (EF-VTE-05, EF-TRE-03)", () => {
  const invoices = [
    {
      id: "a",
      total: fc(7_000),
      paymentStatus: "unpaid" as const,
      creditRequestId: "r1",
      credited: fc(7_000),
    },
    {
      id: "b",
      total: fc(15_000),
      paymentStatus: "unpaid" as const,
      creditRequestId: "r1",
      credited: fc(15_000),
    },
    {
      id: "c",
      total: fc(5_000),
      paymentStatus: "unpaid" as const,
      creditRequestId: "r2",
      credited: fc(5_000),
    },
  ];
  const balances = invoiceBalances(invoices, [
    {
      allocations: [
        { invoiceId: "a", amount: fc(7_000) },
        { invoiceId: "b", amount: fc(3_000) },
      ],
    },
  ]);
  const debts = customerDebts({
    requests: [
      { id: "r1", kind: "credit", orderId: "o1", customerId: "rose" },
      { id: "r2", kind: "credit", orderId: "o2", customerId: "rose" },
      { id: "r3", kind: "credit", orderId: "o3", customerId: "rose" },
    ],
    decisions: [
      { requestId: "r1", approved: true, decidedAt: "2026-11-01T20:00:00.000Z" },
      { requestId: "r2", approved: true, decidedAt: "2026-11-06T20:00:00.000Z" },
      { requestId: "r3", approved: false, decidedAt: "2026-11-06T21:00:00.000Z" },
    ],
    invoices,
    balances,
    currency: "CDF",
  });

  it("ne retient que les crédits validés, avec le montant converti et le reste dû", () => {
    expect(debts.map((debt) => [debt.requestId, debt.amount, debt.remaining])).toEqual([
      ["r1", fc(22_000), fc(12_000)],
      ["r2", fc(5_000), fc(5_000)],
    ]);
    expect(outstandingOf("rose", debts, "CDF")).toEqual(fc(17_000));
  });

  it("calcule l'ancienneté en jours", () => {
    expect(debtAgeDays("2026-11-01T20:00:00.000Z", "2026-11-07T18:00:00.000Z")).toBe(5);
  });
});
