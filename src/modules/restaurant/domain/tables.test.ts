import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { hasPermission } from "../permissions";
import {
  buildTableBill,
  nextTableLabel,
  shortTableLabel,
  tableSessions,
  validateTableLabel,
} from "./tables";
import type { AdvanceInvoice, Order, OrderLine, PrepStatus } from "./types";

const DAY_START = "2026-11-07T04:00:00.000Z";

function line(menuItemId: string, price: number, quantity: number): OrderLine {
  return {
    menuItemId,
    name: menuItemId,
    servicePointId: "sp",
    unit: "bottle",
    unitPrice: moneyFromMajor(price, "CDF"),
    quantity,
  };
}

function order(id: string, tableId: string | null, createdAt: string, waiterName = "Amani"): Order {
  return {
    id,
    establishmentId: "e",
    number: `CMD-${id}`,
    mode: tableId ? "dine-in" : "takeaway",
    tableId,
    tableLabel: tableId,
    waiterId: waiterName,
    waiterName,
    deviceCode: "D01",
    createdAt,
    lines: [],
    total: moneyFromMajor(0, "CDF"),
    invoiceIds: [],
  };
}

function invoice(
  id: string,
  orderId: string,
  lines: OrderLine[],
  prepStatus: PrepStatus = "pending",
  cancelled = false,
): AdvanceInvoice {
  const total = lines.reduce((sum, l) => sum + l.unitPrice.amountMinor * l.quantity, 0);
  return {
    id,
    establishmentId: "e",
    orderId,
    servicePointId: "sp",
    number: `FAC-${id}`,
    mode: "dine-in",
    tableLabel: null,
    waiterId: "w",
    waiterName: "Amani",
    deviceCode: "D01",
    createdAt: DAY_START,
    lines,
    total: { amountMinor: total, currency: "CDF" },
    prepStatus,
    paymentStatus: cancelled ? "cancelled" : "unpaid",
  };
}

describe("occupation des tables", () => {
  const orders = [
    order("o1", "t1", "2026-11-07T10:00:00.000Z"),
    order("o2", "t1", "2026-11-07T10:30:00.000Z", "Neema"),
    order("o3", "t2", "2026-11-07T09:00:00.000Z"),
    order("o4", "t2", "2026-11-07T11:00:00.000Z"),
    order("o5", null, "2026-11-07T11:00:00.000Z"),
    order("o6", "t3", "2026-11-06T20:00:00.000Z"),
    order("o7", "t4", "2026-11-07T12:00:00.000Z"),
  ];
  const invoices = [
    invoice("i1", "o1", [line("primus", 3500, 2)], "served"),
    invoice("i2", "o2", [line("frites", 4000, 1)], "ready"),
    invoice("i3", "o3", [line("primus", 3500, 1)]),
    invoice("i4", "o4", [line("tilapia", 15000, 1)]),
    invoice("i5", "o5", [line("primus", 3500, 1)]),
    invoice("i6", "o6", [line("primus", 3500, 1)]),
    invoice("i7", "o7", [line("primus", 3500, 1)], "pending", true),
  ];
  const sessions = tableSessions({
    orders,
    invoices,
    releases: [
      {
        id: "r1",
        establishmentId: "e",
        tableId: "t2",
        releasedAt: "2026-11-07T10:00:00.000Z",
        releasedBy: "w",
        releasedByName: "Amani",
      },
    ],
    dayStart: DAY_START,
    currency: "CDF",
  });

  it("EF-CMD-04 : les commandes complémentaires s'ajoutent à la même occupation", () => {
    const t1 = sessions.get("t1");
    expect(t1?.orders.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(t1?.total.amountMinor).toBe(1_100_000);
    expect(t1?.waiterNames).toEqual(["Amani", "Neema"]);
    expect(t1?.prepStatus).toBe("ready");
  });

  it("une libération ouvre une nouvelle occupation", () => {
    expect(sessions.get("t2")?.orders.map((o) => o.id)).toEqual(["o4"]);
  });

  it("ignore les ventes à emporter, la veille et les commandes annulées", () => {
    expect([...sessions.keys()].sort()).toEqual(["t1", "t2"]);
  });

  it("EF-CMD-05 : l'addition regroupe les lignes par élément et par prix", () => {
    const bill = buildTableBill({
      ...sessions.get("t1")!,
      invoices: [
        invoice("a", "o1", [line("primus", 3500, 2), line("frites", 4000, 1)]),
        invoice("b", "o2", [line("primus", 3500, 1), line("primus", 4000, 1)]),
      ],
    });
    expect(bill.lines.map((l) => [l.menuItemId, l.unitPrice.amountMinor, l.quantity])).toEqual([
      ["primus", 350_000, 3],
      ["frites", 400_000, 1],
      ["primus", 400_000, 1],
    ]);
    expect(bill.lines[0]?.total.amountMinor).toBe(1_050_000);
  });
});

describe("libellés des tables", () => {
  const tables = [
    { id: "1", label: "Table 1", archivedAt: null },
    { id: "2", label: "Table 12", archivedAt: null },
    { id: "3", label: "Terrasse", archivedAt: null },
    { id: "4", label: "Table 20", archivedAt: "2026-11-01T00:00:00.000Z" },
  ];

  it("propose le numéro suivant", () => {
    expect(nextTableLabel(tables)).toBe("Table 21");
    expect(nextTableLabel([])).toBe("Table 1");
  });

  it("refuse un nom vide, trop long ou déjà utilisé par une table active", () => {
    expect(validateTableLabel("  ", tables)).toMatch(/Donnez un nom/);
    expect(validateTableLabel("x".repeat(30), tables)).toMatch(/24 caractères/);
    expect(validateTableLabel("table 12", tables)).toMatch(/déjà/);
    expect(validateTableLabel("Table 12", tables, "2")).toBeNull();
    expect(validateTableLabel("Table 20", tables)).toBeNull();
  });

  it("raccourcit « Table 12 » en « 12 »", () => {
    expect(shortTableLabel("Table 12")).toBe("12");
    expect(shortTableLabel("Terrasse")).toBe("Terrasse");
  });
});

describe("droits sur les tables", () => {
  it("le gérant gère les tables, le serveur peut seulement les libérer", () => {
    expect(hasPermission("manager", "restaurant.table.manage")).toBe(true);
    expect(hasPermission("waiter", "restaurant.table.manage")).toBe(false);
    expect(hasPermission("waiter", "restaurant.table.release")).toBe(true);
    expect(hasPermission("reader", "restaurant.table.release")).toBe(false);
  });
});
