import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authorize } from "@/server/authz/authorize";
import { withContext } from "@/server/db/context";
import {
  createEstablishment,
  getEstablishment,
  listEstablishments,
  reactivateEstablishment,
  setModuleEnabled,
  suspendEstablishment,
  updateEstablishmentIdentity,
} from "@/server/owner/establishments";
import { getOwnerOverview } from "@/server/owner/overview";
import { deviceFromRequest } from "@/server/sync/device-request";
import { registerDevice, resolveDevice } from "@/server/sync/devices";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

/** Espace propriétaire (EF-PRO, EF-ETB, EF-MOD, RG-MOD-02, RG-PRO-01). */
let db: TestDb;
let fx: Fixtures;
let deviceToken: string;

const owner = () => ({ userId: fx.owner.id, isOwner: true, isElevated: true });
const manager = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });
const meta = { ip: "10.6.0.1" };

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  deviceToken = (
    await registerDevice(db.prisma, manager(), { establishmentId: fx.a.id, name: "Caisse" })
  ).token;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("accès réservé au propriétaire", () => {
  it("refuse le gérant et le propriétaire sans double authentification", async () => {
    await expect(listEstablishments(db.prisma, manager())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getOwnerOverview(
        db.prisma,
        { userId: fx.owner.id, isOwner: true, isElevated: false },
        { period: "jour" },
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
});

describe("création d'un établissement (EF-ETB-01)", () => {
  it("crée l'établissement, ses modules, ses paramètres et ses points de service", async () => {
    const created = await createEstablishment(
      db.prisma,
      owner(),
      {
        name: "Best Food II",
        slug: "best-food-2",
        legalName: "",
        address: "Avenue Lumumba, Bukavu",
        phone: "",
        type: "restaurant",
        currency: "CDF",
        timeZone: "Africa/Lubumbashi",
        withDefaultServicePoints: true,
      },
      meta,
    );
    const detail = await getEstablishment(db.prisma, owner(), { establishmentId: created.id });
    expect(detail).toMatchObject({
      name: "Best Food II",
      slug: "best-food-2",
      legalName: null,
      address: "Avenue Lumumba, Bukavu",
      currency: "CDF",
      status: "active",
      missingHeaderFields: ["Raison sociale", "Téléphone"],
    });
    expect(detail.modules.filter((module) => module.enabled).map((module) => module.id)).toEqual([
      "catalog",
      "stock",
      "sales",
      "documents",
      "restaurant",
      "reports",
    ]);
    const points = await withContext(
      db.prisma,
      { establishmentId: created.id, isOwner: false },
      (tx) => tx.servicePoint.findMany({ orderBy: { sortOrder: "asc" } }),
    );
    expect(points.map((point) => point.name)).toEqual(["Comptoir", "Cuisine", "Grillade"]);
  });

  it("refuse une adresse déjà prise ou réservée", async () => {
    const base = {
      name: "Doublon",
      legalName: null,
      address: null,
      phone: null,
      type: "restaurant",
      currency: "CDF" as const,
      timeZone: "Africa/Lubumbashi",
      withDefaultServicePoints: false,
    };
    await expect(
      createEstablishment(db.prisma, owner(), { ...base, slug: "restaurant-a" }),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });
    await expect(
      createEstablishment(db.prisma, owner(), { ...base, slug: "demo" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createEstablishment(db.prisma, owner(), { ...base, slug: "Avec Espaces" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("identité et journal (EF-ETB-02, RG-PRO-01)", () => {
  it("met à jour l'identité ; le gérant voit l'action du propriétaire dans son journal", async () => {
    await updateEstablishmentIdentity(
      db.prisma,
      owner(),
      {
        establishmentId: fx.a.id,
        name: "Restaurant A",
        legalName: "Restaurant A SARL",
        address: "Bukavu",
        phone: "+243990000000",
      },
      meta,
    );
    const detail = await getEstablishment(db.prisma, owner(), { establishmentId: fx.a.id });
    expect(detail.missingHeaderFields).toEqual([]);
    expect(detail.currency).toBe("CDF");
    const entry = await withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
      tx.auditLog.findFirst({ where: { action: "owner.establishment.updated" } }),
    );
    expect(entry).toMatchObject({ actorRole: "owner", actorUserId: fx.owner.id });
  });
});

describe("modules (EF-MOD-01, RG-MOD-01, RG-MOD-02)", () => {
  it("respecte les dépendances dans les deux sens", async () => {
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "preparation",
      enabled: true,
    });
    await expect(
      setModuleEnabled(db.prisma, owner(), {
        establishmentId: fx.a.id,
        module: "restaurant",
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "MODULE_REQUIRED" });
    await expect(
      setModuleEnabled(db.prisma, owner(), {
        establishmentId: fx.b.id,
        module: "barcodes",
        enabled: true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      setModuleEnabled(db.prisma, owner(), {
        establishmentId: fx.a.id,
        module: "core",
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_MODULE" });
  });

  it("désactiver un module ferme ses droits ; le réactiver les rend", async () => {
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "preparation",
      enabled: false,
    });
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "restaurant",
      enabled: false,
    });
    await expect(
      authorize(db.prisma, manager(), "restaurant.order.create", { establishmentId: fx.a.id }),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED" });
    await setModuleEnabled(db.prisma, owner(), {
      establishmentId: fx.a.id,
      module: "restaurant",
      enabled: true,
    });
    await expect(
      authorize(db.prisma, manager(), "restaurant.order.create", { establishmentId: fx.a.id }),
    ).resolves.toMatchObject({ role: "manager" });
  });
});

describe("suspension (EF-ETB-03)", () => {
  it("bloque l'établissement sans effacer les appareils, puis rend l'accès", async () => {
    await expect(
      suspendEstablishment(db.prisma, owner(), { establishmentId: fx.a.id, reason: "" }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await suspendEstablishment(
      db.prisma,
      owner(),
      { establishmentId: fx.a.id, reason: "Travaux" },
      meta,
    );
    await expect(
      authorize(db.prisma, manager(), "restaurant.order.create", { establishmentId: fx.a.id }),
    ).rejects.toMatchObject({ code: "ESTABLISHMENT_SUSPENDED" });
    expect(await resolveDevice(db.prisma, `Device ${deviceToken}`)).toEqual({
      status: "suspended",
    });
    const { response } = await deviceFromRequest(db.prisma, `Device ${deviceToken}`);
    // 403 et non 401 : l'appareil garde ses données et ses opérations en attente.
    expect(response?.status).toBe(403);
    expect(
      (await getEstablishment(db.prisma, owner(), { establishmentId: fx.a.id })).suspendedReason,
    ).toBe("Travaux");

    await reactivateEstablishment(db.prisma, owner(), { establishmentId: fx.a.id }, meta);
    expect((await resolveDevice(db.prisma, `Device ${deviceToken}`)).status).toBe("ok");
    const unknown = await deviceFromRequest(db.prisma, "Device inconnu");
    expect(unknown.response?.status).toBe(401);
  });
});

describe("vue d'ensemble (EF-PRO-01, EF-PRO-05)", () => {
  it("additionne les ventes du jour et signale le stock du matin manquant", async () => {
    const resolved = await resolveDevice(db.prisma, `Device ${deviceToken}`);
    if (resolved.status !== "ok") throw new Error("appareil attendu");
    const device = resolved.device;
    const [result] = await pushOperations(db.prisma, device, [
      {
        id: crypto.randomUUID(),
        type: "restaurant.order.created",
        establishmentId: fx.a.id,
        userId: fx.waiterA.id,
        deviceId: device.id,
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          orderId: crypto.randomUUID(),
          number: `CMD-2026-${device.code}-000001`,
          createdAt: new Date().toISOString(),
          mode: "takeaway",
          tableId: null,
          lines: [{ menuItemId: fx.a.beer.id, quantity: 2 }],
          invoices: [
            {
              id: crypto.randomUUID(),
              number: `FAC-2026-${device.code}-000001`,
              servicePointId: fx.a.counter.id,
            },
          ],
        },
      },
    ]);
    expect(result?.status).toBe("accepted");

    const overview = await getOwnerOverview(db.prisma, owner(), { period: "jour" });
    const a = overview.establishments.find((entry) => entry.id === fx.a.id);
    expect(a?.sales.revenue.amountMinor).toBe(700_000);
    expect(a?.sales.orders).toBe(1);
    expect(a?.devices.active).toBe(1);
    expect(overview.totals).toEqual([expect.objectContaining({ currency: "CDF", orders: 1 })]);
    expect(
      overview.alerts.some(
        (alert) => alert.establishmentId === fx.a.id && alert.kind === "morning-stock",
      ),
    ).toBe(true);
  });
});
