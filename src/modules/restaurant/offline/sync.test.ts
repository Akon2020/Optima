import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
