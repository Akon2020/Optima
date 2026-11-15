import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import {
  cashClosingDraft,
  createOrder,
  dayClosingStatus,
  declareCashClosing,
  morningProposals,
  recordPayment,
  recordStockCount,
  saveMorningStock,
  validateDay,
  type DeviceContext,
} from "./repository";

const manager: DeviceContext = {
  establishmentId: "test",
  userId: "manager",
  userName: "Gérant test",
  deviceId: "device-1",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};
const waiter: DeviceContext = { ...manager, userId: "w1", userName: "Amani", role: "waiter" };
const fc = (major: number) => moneyFromMajor(major, "CDF");

let db: RestaurantDb;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 8 h locales à Bukavu : ouverture de la journée du 7 novembre.
  vi.setSystemTime(new Date("2026-11-07T06:00:00.000Z"));
  db = new RestaurantDb(`test-${Math.random()}`);
  const createdAt = "2026-11-01T06:00:00.000Z";
  await db.servicePoints.bulkPut([
    {
      id: "sp-counter",
      establishmentId: "test",
      kind: "counter",
      name: "Comptoir",
      menu: "drinks",
      sortOrder: 1,
    },
    {
      id: "sp-kitchen",
      establishmentId: "test",
      kind: "kitchen",
      name: "Cuisine",
      menu: "food",
      sortOrder: 2,
    },
  ]);
  await db.menuItems.bulkPut([
    {
      id: "item-primus",
      establishmentId: "test",
      servicePointId: "sp-counter",
      name: "Primus 72 cl",
      description: "",
      category: "Bières",
      unit: "bottle",
      price: fc(3_500),
      createdAt,
      archivedAt: null,
    },
    {
      id: "item-tilapia",
      establishmentId: "test",
      servicePointId: "sp-kitchen",
      name: "Tilapia",
      description: "",
      category: "Poissons",
      unit: "dish",
      price: fc(15_000),
      createdAt,
      archivedAt: null,
    },
  ]);
  await saveMorningStock(db, manager, {
    servicePointId: "sp-counter",
    lines: [{ menuItemId: "item-primus", quantity: 48, reason: "" }],
  });
  await saveMorningStock(db, manager, {
    servicePointId: "sp-kitchen",
    lines: [{ menuItemId: "item-tilapia", quantity: 10, reason: "" }],
  });
  // 20 h : une commande de 22 000 FC, encaissée avec 25 000 FC.
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
  const { invoices } = await createOrder(db, waiter, {
    mode: "takeaway",
    tableId: null,
    lines: [
      { menuItemId: "item-primus", quantity: 2 },
      { menuItemId: "item-tilapia", quantity: 1 },
    ],
  });
  await recordPayment(db, waiter, {
    invoiceIds: invoices.map((invoice) => invoice.id),
    method: "cash",
    provider: null,
    reference: null,
    currency: "CDF",
    amountMajor: 25_000,
  });
  vi.setSystemTime(new Date("2026-11-07T20:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("clôture de caisse (EF-CLO-01, EF-CLO-02, D-032)", () => {
  it("prépare l'attendu par mode de paiement et par point de service", async () => {
    const draft = await cashClosingDraft(db, waiter);
    expect(draft.day).toBe("2026-11-07");
    expect(draft.lines).toEqual([
      { key: "cash::CDF", method: "cash", provider: null, expected: fc(22_000) },
    ]);
    expect(draft.byServicePoint).toEqual(
      expect.arrayContaining([
        { servicePointId: "sp-counter", amount: fc(7_000) },
        { servicePointId: "sp-kitchen", amount: fc(15_000) },
      ]),
    );
    expect(draft.unpaidInvoiceIds).toEqual([]);
  });

  it("exige un commentaire pour un manquant, puis fige la déclaration", async () => {
    await expect(
      declareCashClosing(db, waiter, { counted: { "cash::CDF": 20_000 }, comment: "" }),
    ).rejects.toMatchObject({ code: "COMMENT_REQUIRED" });
    const closing = await declareCashClosing(db, waiter, {
      counted: { "cash::CDF": 20_000 },
      comment: "Monnaie rendue en trop",
    });
    expect(closing.lines[0]?.counted).toEqual(fc(20_000));
    expect(
      (await db.outbox.toArray()).some((op) => op.type === "restaurant.cash-closing.declared"),
    ).toBe(true);
    // Les paiements déclarés ne reviennent pas dans la clôture suivante.
    await expect(
      declareCashClosing(db, waiter, { counted: {}, comment: "" }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_CLOSE" });
  });
});

describe("comptage du stock et validation de la journée (EF-CLO-03, EF-CLO-04)", () => {
  async function countAll() {
    await recordStockCount(db, manager, {
      servicePointId: "sp-counter",
      lines: [{ menuItemId: "item-primus", counted: 46, declaredOut: 0, outReason: "" }],
      comment: "",
    });
    await recordStockCount(db, manager, {
      servicePointId: "sp-kitchen",
      lines: [
        { menuItemId: "item-tilapia", counted: 8, declaredOut: 1, outReason: "Repas du personnel" },
      ],
      comment: "",
    });
  }

  it("calcule le stock attendu et réserve le comptage au gérant", async () => {
    await expect(
      recordStockCount(db, waiter, { servicePointId: "sp-counter", lines: [], comment: "" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const count = await recordStockCount(db, manager, {
      servicePointId: "sp-counter",
      lines: [{ menuItemId: "item-primus", counted: 44, declaredOut: 0, outReason: "" }],
      comment: "Deux bouteilles introuvables",
    });
    expect(count.lines[0]).toMatchObject({ morning: 48, sold: 2, counted: 44 });
  });

  it("nomme ce qui manque, puis valide quand tout est déclaré et compté", async () => {
    const before = await dayClosingStatus(db, manager);
    expect(before.undeclared.map((entry) => entry.name)).toEqual(["Amani"]);
    expect(before.pointsNotCounted.map((point) => point.name)).toEqual(["Comptoir", "Cuisine"]);
    await expect(
      validateDay(db, manager, { comment: "", isOnline: true, writeLocally: true }),
    ).rejects.toMatchObject({ code: "STOCK_NOT_COUNTED" });

    await countAll();
    await declareCashClosing(db, waiter, { counted: { "cash::CDF": 22_000 }, comment: "" });
    await expect(
      validateDay(db, waiter, { comment: "", isOnline: true, writeLocally: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const result = await validateDay(db, manager, {
      comment: "",
      isOnline: true,
      writeLocally: true,
    });
    expect(result.day).toBe("2026-11-07");
    expect(await db.dayClosings.count()).toBe(1);

    // D-039 : ce qui suit la validation appartient à la journée suivante.
    expect((await cashClosingDraft(db, waiter)).day).toBe("2026-11-08");
  });

  it("RG-CLO-03 : refuse de valider avec des opérations en attente", async () => {
    await countAll();
    await declareCashClosing(db, waiter, { counted: { "cash::CDF": 22_000 }, comment: "" });
    await expect(
      validateDay(db, manager, { comment: "", isOnline: true, writeLocally: false }),
    ).rejects.toMatchObject({ code: "PENDING_OPERATIONS" });
  });

  it("EF-REQ-04 : le stock compté devient la base du lendemain", async () => {
    await countAll();
    const proposals = await morningProposals(db, manager, "2026-11-08T04:00:00.000Z");
    expect(proposals.get("item-primus")).toBe(46);
    expect(proposals.get("item-tilapia")).toBe(8);
  });
});
