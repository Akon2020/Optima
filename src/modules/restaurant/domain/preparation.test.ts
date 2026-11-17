import { describe, expect, it } from "vitest";

import {
  canWorkStation,
  isDeclaredSoldOut,
  pointForStation,
  readyForWaiter,
  stationQueue,
} from "./preparation";
import type { ServicePoint } from "./types";

const points: ServicePoint[] = [
  {
    id: "sp-kitchen",
    establishmentId: "e",
    kind: "kitchen",
    name: "Cuisine",
    menu: "food",
    sortOrder: 2,
  },
  {
    id: "sp-counter",
    establishmentId: "e",
    kind: "counter",
    name: "Comptoir",
    menu: "drinks",
    sortOrder: 1,
  },
];

const invoice = (
  id: string,
  overrides: Partial<{
    servicePointId: string;
    createdAt: string;
    prepStatus: "pending" | "ready" | "served";
    paymentStatus: "unpaid" | "cancelled";
    waiterId: string;
  }> = {},
) => ({
  id,
  servicePointId: "sp-kitchen",
  createdAt: "2026-11-16T10:00:00.000Z",
  prepStatus: "pending" as const,
  paymentStatus: "unpaid" as const,
  waiterId: "amani",
  ...overrides,
});

describe("postes de préparation (EF-PRE-01 à 03, D-066)", () => {
  it("retrouve le point de service d'un poste par son adresse", () => {
    expect(pointForStation("cuisine", points)?.id).toBe("sp-kitchen");
    expect(pointForStation("comptoir", points)?.id).toBe("sp-counter");
    expect(pointForStation("cave", points)).toBeUndefined();
  });

  it("un préparateur ne travaille que pour son poste", () => {
    expect(canWorkStation("prep", "sp-kitchen", "sp-kitchen")).toBe(true);
    expect(canWorkStation("prep", "sp-kitchen", "sp-counter")).toBe(false);
    expect(canWorkStation("manager", null, "sp-counter")).toBe(true);
    expect(canWorkStation("waiter", null, "sp-counter")).toBe(false);
  });

  it("EF-PRE-01 : la file du poste, dans l'ordre d'arrivée, sans les factures annulées", () => {
    const queue = stationQueue(
      [
        invoice("late", { createdAt: "2026-11-16T10:05:00.000Z" }),
        invoice("early", { createdAt: "2026-11-16T09:55:00.000Z" }),
        invoice("other", { servicePointId: "sp-counter" }),
        invoice("cancelled", { paymentStatus: "cancelled" }),
        invoice("done", { prepStatus: "ready" }),
        invoice("served", { prepStatus: "served" }),
      ],
      "sp-kitchen",
    );
    expect(queue.pending.map((entry) => entry.id)).toEqual(["early", "late"]);
    expect(queue.ready.map((entry) => entry.id)).toEqual(["done"]);
  });

  it("EF-PRE-02 : le serveur voit ses factures prêtes, pas celles des autres", () => {
    const ready = readyForWaiter(
      [
        invoice("mine", { prepStatus: "ready" }),
        invoice("theirs", { prepStatus: "ready", waiterId: "neema" }),
        invoice("pending"),
      ],
      "amani",
    );
    expect(ready.map((entry) => entry.id)).toEqual(["mine"]);
  });

  it("EF-PRE-03 : « épuisé » ne vaut que pour la journée déclarée", () => {
    expect(isDeclaredSoldOut({ soldOutDay: "2026-11-16" }, "2026-11-16")).toBe(true);
    expect(isDeclaredSoldOut({ soldOutDay: "2026-11-16" }, "2026-11-17")).toBe(false);
    expect(isDeclaredSoldOut({}, "2026-11-16")).toBe(false);
  });
});
