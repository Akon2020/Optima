import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { buildSalesReport, defaultReportRange, type ReportInvoice } from "./report";

const fc = (major: number) => moneyFromMajor(major, "CDF");

const invoice = (overrides: Partial<ReportInvoice>): ReportInvoice => ({
  id: "i1",
  orderId: "o1",
  day: "2026-11-10",
  hour: 12,
  servicePointId: "counter",
  waiterId: "amani",
  total: fc(7_000),
  discount: fc(0),
  isCancelled: false,
  ...overrides,
});

const base = {
  from: "2026-11-10",
  to: "2026-11-11",
  currency: "CDF" as const,
  servicePoints: [
    { id: "counter", name: "Comptoir" },
    { id: "kitchen", name: "Cuisine" },
  ],
  waiterNames: new Map([
    ["amani", "Amani"],
    ["neema", "Neema"],
  ]),
  items: [
    {
      id: "primus",
      name: "Primus 72 cl",
      servicePointId: "counter",
      unit: "bottle" as const,
      isSellable: true,
    },
    {
      id: "tilapia",
      name: "Tilapia",
      servicePointId: "kitchen",
      unit: "dish" as const,
      isSellable: true,
    },
    {
      id: "wine",
      name: "Vin rouge",
      servicePointId: "counter",
      unit: "bottle" as const,
      isSellable: false,
    },
    {
      id: "fries",
      name: "Frites",
      servicePointId: "kitchen",
      unit: "dish" as const,
      isSellable: true,
    },
  ],
};

describe("rapport des ventes (EF-RAP-01, D-065)", () => {
  const report = buildSalesReport({
    ...base,
    invoices: [
      invoice({}),
      invoice({ id: "i2", servicePointId: "kitchen", total: fc(15_000), discount: fc(1_000) }),
      invoice({ id: "i3", orderId: "o2", waiterId: "neema", hour: 20, total: fc(3_500) }),
      invoice({ id: "i4", orderId: "o3", total: fc(9_000), isCancelled: true }),
      invoice({ id: "i5", orderId: "o4", day: "2026-11-12", total: fc(99_000) }),
    ],
    lines: [
      { invoiceId: "i1", menuItemId: "primus", quantity: 2, lineTotal: fc(7_000) },
      { invoiceId: "i2", menuItemId: "tilapia", quantity: 1, lineTotal: fc(15_000) },
      { invoiceId: "i3", menuItemId: "primus", quantity: 1, lineTotal: fc(3_500) },
      { invoiceId: "i4", menuItemId: "tilapia", quantity: 9, lineTotal: fc(9_000) },
    ],
    payments: [
      { method: "cash", provider: null, tenderedCurrency: "CDF", net: fc(10_000) },
      { method: "cash", provider: null, tenderedCurrency: "USD", net: fc(14_000) },
      { method: "mobile-money", provider: "mpesa", tenderedCurrency: "CDF", net: fc(500) },
    ],
  });

  it("ventes nettes, annulations à part, journées hors période exclues", () => {
    // 7 000 + 15 000 − 1 000 + 3 500.
    expect(report.revenue).toEqual(fc(24_500));
    expect(report.discounts).toEqual(fc(1_000));
    expect(report.invoices).toBe(3);
    expect(report.orders).toBe(2);
    expect(report.averageOrder).toEqual(fc(12_250));
    expect(report.cancelled).toEqual({ count: 1, amount: fc(9_000) });
  });

  it("répartit par point de service, par serveur, par heure et par mode de paiement", () => {
    expect(report.byPoint.map((point) => [point.name, point.revenue.amountMinor])).toEqual([
      ["Comptoir", 1_050_000],
      ["Cuisine", 1_400_000],
    ]);
    expect(report.byWaiter.map((waiter) => [waiter.name, waiter.orders])).toEqual([
      ["Amani", 1],
      ["Neema", 1],
    ]);
    expect(report.byHour.map((entry) => entry.hour)).toEqual([12, 20]);
    expect(report.byMethod.map((entry) => entry.label)).toEqual([
      "Espèces ($)",
      "Espèces (FC)",
      "Mobile Money · M-Pesa",
    ]);
  });

  it("classe les articles ; les moins vendus incluent ceux qui ne se sont pas vendus", () => {
    expect(report.topItems.map((item) => [item.name, item.quantity])).toEqual([
      ["Primus 72 cl", 3],
      ["Tilapia", 1],
    ]);
    // Le vin, sans prix, n'est pas vendable : il n'est pas compté parmi les moins vendus.
    expect(report.bottomItems.map((item) => [item.name, item.quantity])).toEqual([
      ["Frites", 0],
      ["Tilapia", 1],
      ["Primus 72 cl", 3],
    ]);
  });

  it("propose par défaut les 7 dernières journées", () => {
    expect(defaultReportRange("2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });
});
