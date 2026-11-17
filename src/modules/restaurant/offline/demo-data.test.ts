import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RESTAURANT_SETTINGS } from "../settings";
import { RestaurantDb } from "./db";
import { ensureDemoData } from "./demo-data";
import type { DeviceContext } from "./repository";

const manager: DeviceContext = {
  establishmentId: "demo",
  userId: "staff-manager",
  userName: "Gérant démo",
  deviceId: "device-demo",
  deviceCode: "D01",
  role: "manager",
  settings: DEFAULT_RESTAURANT_SETTINGS,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("données de démonstration", () => {
  it("clôture la veille de bout en bout (EF-CLO-01 à 04)", async () => {
    const db = new RestaurantDb(`test-${Math.random()}`);
    await ensureDemoData(db, manager);
    const [closing] = await db.dayClosings.toArray();
    expect(closing?.day).toBe("2026-11-06");
    expect(closing?.stockCountIds).toHaveLength(3);
    const cash = await db.cashClosings.where("day").equals("2026-11-06").toArray();
    expect(cash.length).toBeGreaterThan(0);
    expect(cash.some((entry) => entry.comment !== null)).toBe(true);
    // D-059 : une cliente doit la dernière commande de la veille.
    expect(await db.customers.count()).toBe(2);
    const credit = (await db.adjustmentRequests.toArray()).find(
      (request) => request.kind === "credit",
    );
    expect(credit).toBeDefined();
    expect(
      (
        await db.invoices
          .where("orderId")
          .equals(credit?.orderId ?? "")
          .toArray()
      ).every((invoice) => invoice.creditRequestId === credit?.id),
    ).toBe(true);
    // Aujourd'hui : des paiements restent à déclarer.
    expect(
      await db.payments.where("createdAt").aboveOrEqual("2026-11-07T04:00:00.000Z").count(),
    ).toBeGreaterThan(0);
  });
});
