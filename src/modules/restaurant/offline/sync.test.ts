import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import type { Payment } from "../domain/types";
import { RestaurantDb } from "./db";
import type { DeviceInfo } from "./device";
import { pullChanges } from "./sync";

const device: DeviceInfo = {
  deviceId: "device-1",
  code: "D01",
  token: "device-1.secret",
  establishmentId: "test",
  slug: "test",
  name: "Restaurant test",
  currency: "CDF",
  timeZone: "Africa/Lubumbashi",
};

let db: RestaurantDb;

function respondWith(changes: { seq: string; entity: string; entityId: string; data: unknown }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ changes, cursor: changes.at(-1)?.seq ?? "0", hasMore: false }),
    ),
  );
}

beforeEach(() => {
  db = new RestaurantDb(`test-${Math.random()}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("réception des changements (GET /api/sync/pull)", () => {
  it("applique un paiement et un taux reçus d'un autre appareil", async () => {
    const payment: Payment = {
      id: "p1",
      establishmentId: "test",
      method: "cash",
      provider: null,
      reference: null,
      tendered: moneyFromMajor(10_000, "CDF"),
      rate: null,
      baseAmount: moneyFromMajor(10_000, "CDF"),
      change: moneyFromMajor(0, "CDF"),
      allocations: [{ invoiceId: "i1", amount: moneyFromMajor(10_000, "CDF") }],
      collectedBy: "w1",
      collectedByName: "Amani",
      deviceCode: "D02",
      createdAt: "2026-11-07T18:00:00.000Z",
    };
    respondWith([
      { seq: "1", entity: "payment", entityId: "p1", data: payment },
      {
        seq: "2",
        entity: "exchange_rate",
        entityId: "r1",
        data: {
          id: "r1",
          establishmentId: "test",
          rate: "2850",
          effectiveAt: "2026-11-07T07:00:00.000Z",
          enteredBy: "m1",
          enteredByName: "Gérant",
        },
      },
    ]);
    expect(await pullChanges(db, device)).toBe(2);
    expect(await db.payments.get("p1")).toEqual(payment);
    expect((await db.exchangeRates.get("r1"))?.rate).toBe("2850");
  });

  it("applique un changement de personnel (EF-CPT-01)", async () => {
    respondWith([
      {
        seq: "3",
        entity: "staff_member",
        entityId: "w1",
        data: {
          id: "w1",
          establishmentId: "test",
          name: "Amani K.",
          role: "waiter",
          status: "active",
        },
      },
    ]);
    expect(await pullChanges(db, device)).toBe(1);
    expect((await db.staff.get("w1"))?.name).toBe("Amani K.");
  });
});
