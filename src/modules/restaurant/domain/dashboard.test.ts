import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { orderPrepStatus, summarizeDay } from "./dashboard";
import type { AdvanceInvoice } from "./types";

function invoice(partial: Partial<AdvanceInvoice> & Pick<AdvanceInvoice, "id">): AdvanceInvoice {
  return {
    establishmentId: "e1",
    orderId: "o1",
    servicePointId: "counter",
    number: "FAC-2026-D01-000001",
    mode: "dine-in",
    tableLabel: "T1",
    waiterId: "w1",
    waiterName: "Serveur A",
    deviceCode: "D01",
    createdAt: "2026-11-07T08:30:00.000Z",
    lines: [
      {
        menuItemId: "beer",
        name: "Bière",
        servicePointId: "counter",
        unit: "bottle",
        unitPrice: moneyFromMajor(3000, "CDF"),
        quantity: 2,
      },
    ],
    total: moneyFromMajor(6000, "CDF"),
    prepStatus: "pending",
    paymentStatus: "unpaid",
    ...partial,
  };
}

describe("synthèse de la journée", () => {
  const start = "2026-11-07T04:00:00.000Z";
  const now = "2026-11-07T10:10:00.000Z";

  it("additionne les souches et exclut les factures annulées (RG-CMD-02)", () => {
    const summary = summarizeDay(
      [
        invoice({ id: "1" }),
        invoice({ id: "2", orderId: "o2", servicePointId: "kitchen" }),
        invoice({ id: "3", orderId: "o3", paymentStatus: "cancelled" }),
      ],
      start,
      now,
      "CDF",
    );
    expect(summary.billed.amountMinor).toBe(1_200_000);
    expect(summary.invoiceCount).toBe(2);
    expect(summary.orderCount).toBe(2);
    expect(summary.averageOrder.amountMinor).toBe(600_000);
    expect(summary.byServicePoint.get("kitchen")?.invoices).toBe(1);
    expect(summary.soldByItem.get("beer")).toBe(4);
  });

  it("ventile les ventes par heure depuis le début de la journée", () => {
    const summary = summarizeDay([invoice({ id: "1" })], start, now, "CDF");
    expect(summary.hourly).toHaveLength(7);
    expect(summary.hourly[4]?.invoices).toBe(1);
  });

  it("une commande n'est servie que si toutes ses factures le sont", () => {
    expect(orderPrepStatus(["served", "ready"])).toBe("ready");
    expect(orderPrepStatus(["served", "pending"])).toBe("pending");
    expect(orderPrepStatus(["served", "served"])).toBe("served");
  });
});
