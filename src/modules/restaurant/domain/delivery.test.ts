import { describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import {
  canCollectFor,
  checkDeliveryDetails,
  courierIssue,
  courierQueue,
  statusIssue,
  zoneIssue,
} from "./delivery";
import type { DeliveryZone } from "./types";

const zone = (id: string, name: string, archivedAt: string | null = null): DeliveryZone => ({
  id,
  establishmentId: "e",
  name,
  fee: moneyFromMajor(2000, "CDF"),
  sortOrder: 1,
  createdAt: "2026-11-18T06:00:00.000Z",
  archivedAt,
});

const ZONES = [zone("z1", "Ibanda"), zone("z2", "Kadutu"), zone("z3", "Bagira", "2026-11-01")];

describe("zones de livraison (EF-LIV-01, D-070)", () => {
  it("accepte une zone nouvelle, gratuite comprise", () => {
    expect(zoneIssue({ name: "Nyalukemba", feeMajor: 3000 }, ZONES)).toBeNull();
    expect(zoneIssue({ name: "Centre", feeMajor: 0 }, ZONES)).toBeNull();
  });

  it("refuse un nom en double (hors zones archivées) et des frais invalides", () => {
    expect(zoneIssue({ name: " ibanda ", feeMajor: 1000 }, ZONES)?.code).toBe("ZONE_NAME_TAKEN");
    expect(zoneIssue({ name: "Ibanda", feeMajor: 1000 }, ZONES, "z1")).toBeNull();
    expect(zoneIssue({ name: "Bagira", feeMajor: 1000 }, ZONES)).toBeNull();
    expect(zoneIssue({ name: "X", feeMajor: 1000 }, ZONES)?.code).toBe("INVALID_ZONE_NAME");
    expect(zoneIssue({ name: "Panzi", feeMajor: -5 }, ZONES)?.code).toBe("INVALID_FEE");
    expect(zoneIssue({ name: "Panzi", feeMajor: 2.5 }, ZONES)?.code).toBe("INVALID_FEE");
    expect(zoneIssue({ name: "Panzi", feeMajor: null }, ZONES)?.code).toBe("INVALID_FEE");
  });
});

describe("coordonnées d'une livraison (EF-LIV-01)", () => {
  const input = {
    customerName: " Neema ",
    phone: "+243 990 000 001",
    address: "Avenue des Écoles, n° 12",
    zoneId: "z2",
    desiredTime: "19:30",
  };

  it("nettoie et retient la zone en service", () => {
    const checked = checkDeliveryDetails(input, ZONES);
    expect(checked).toMatchObject({
      ok: true,
      details: {
        customerName: "Neema",
        phone: "+243990000001",
        zone: { id: "z2" },
        desiredTime: "19:30",
      },
    });
    expect(checkDeliveryDetails({ ...input, desiredTime: "" }, ZONES)).toMatchObject({
      details: { desiredTime: null },
    });
  });

  it("refuse un champ manquant, une zone archivée ou une heure mal écrite", () => {
    const code = (patch: Partial<typeof input>) => {
      const checked = checkDeliveryDetails({ ...input, ...patch }, ZONES);
      return checked.ok ? null : checked.code;
    };
    expect(code({ customerName: "" })).toBe("CUSTOMER_NAME_REQUIRED");
    expect(code({ phone: "12" })).toBe("INVALID_PHONE");
    expect(code({ address: "" })).toBe("ADDRESS_REQUIRED");
    expect(code({ zoneId: "z3" })).toBe("ZONE_REQUIRED");
    expect(code({ desiredTime: "7h30" })).toBe("INVALID_TIME");
  });
});

describe("attribution et statuts (EF-LIV-02, EF-LIV-03)", () => {
  const open = { status: "preparing" as const, courierId: "c1" };

  it("seul un livreur reçoit une livraison encore ouverte", () => {
    expect(courierIssue(open, { role: "courier" })).toBeNull();
    expect(courierIssue(open, { role: "waiter" })?.code).toBe("NOT_A_COURIER");
    expect(courierIssue({ status: "delivered" }, { role: "courier" })?.code).toBe(
      "DELIVERY_CLOSED",
    );
  });

  it("le livreur fait avancer ses livraisons ; le gérant toutes", () => {
    const issue = (patch: Partial<Parameters<typeof statusIssue>[0]>) =>
      statusIssue({
        delivery: open,
        next: "en-route",
        role: "courier",
        userId: "c1",
        note: null,
        ...patch,
      })?.code ?? null;
    expect(issue({})).toBeNull();
    expect(issue({ userId: "c2" })).toBe("NOT_YOUR_DELIVERY");
    expect(issue({ role: "manager", userId: "m" })).toBeNull();
    expect(issue({ role: "waiter", userId: "w" })).toBe("FORBIDDEN");
    expect(issue({ next: "delivered" })).toBe("INVALID_TRANSITION");
    expect(issue({ delivery: { status: "preparing", courierId: null }, role: "manager" })).toBe(
      "NO_COURIER",
    );
    expect(issue({ next: "failed" })).toBe("REASON_REQUIRED");
    expect(issue({ next: "failed", note: "Client absent" })).toBeNull();
    expect(issue({ delivery: { status: "delivered", courierId: "c1" }, next: "failed" })).toBe(
      "INVALID_TRANSITION",
    );
  });

  it("le livreur n'encaisse que ses livraisons, le serveur que ses ventes", () => {
    const base = { userId: "c1", waiterId: "w1" };
    expect(canCollectFor({ ...base, role: "courier", delivery: { courierId: "c1" } })).toBe(true);
    expect(canCollectFor({ ...base, role: "courier", delivery: { courierId: "c2" } })).toBe(false);
    expect(canCollectFor({ ...base, role: "courier", delivery: undefined })).toBe(false);
    expect(canCollectFor({ ...base, role: "waiter", userId: "w1", delivery: undefined })).toBe(
      true,
    );
    expect(canCollectFor({ ...base, role: "manager", delivery: undefined })).toBe(true);
  });

  it("les livraisons en cours du livreur passent avant les terminées", () => {
    const queue = courierQueue(
      [
        { id: "a", courierId: "c1", status: "delivered", createdAt: "2026-11-18T08:00:00Z" },
        { id: "b", courierId: "c1", status: "en-route", createdAt: "2026-11-18T09:00:00Z" },
        { id: "c", courierId: "c2", status: "preparing", createdAt: "2026-11-18T07:00:00Z" },
        { id: "d", courierId: "c1", status: "preparing", createdAt: "2026-11-18T08:30:00Z" },
      ],
      "c1",
    );
    expect(queue.map((delivery) => delivery.id)).toEqual(["d", "b", "a"]);
  });
});
