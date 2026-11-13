import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { moneyFromMajor } from "@/shared/lib/money";

import { RestaurantDb } from "./db";
import {
  applyStaffMember,
  getEnabledModules,
  effectiveRole,
  getActiveUserId,
  rememberDeviceUser,
  setUserPin,
  unlockWithPin,
  wipeDevice,
  saveDevice,
  getDevice,
} from "./device";
import { applyChange } from "./sync";

let db: RestaurantDb;

beforeEach(() => {
  db = new RestaurantDb(`device-${Math.random()}`);
});

describe("utilisateurs de l'appareil (EF-AUT-05)", () => {
  it("reprend la main par PIN et désigne l'utilisateur actif", async () => {
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    await setUserPin(db, "u1", "2580");
    expect(await unlockWithPin(db, "u1", "2580")).toEqual({ ok: true });
    expect(await getActiveUserId(db)).toBe("u1");
  });

  it("verrouille après 5 erreurs ; seul le mot de passe déverrouille", async () => {
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    await setUserPin(db, "u1", "2580");
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await unlockWithPin(db, "u1", "0000")).toMatchObject({ ok: false, isLocked: false });
    }
    expect(await unlockWithPin(db, "u1", "0000")).toMatchObject({ ok: false, isLocked: true });
    expect(await unlockWithPin(db, "u1", "2580")).toMatchObject({ ok: false, isLocked: true });
    // Nouvelle vérification du mot de passe : le PIN existant redevient utilisable.
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    expect(await unlockWithPin(db, "u1", "2580")).toEqual({ ok: true });
    // Sept vérifications PBKDF2 à 210 000 itérations (D-024) : lent par conception,
    // et plus encore quand toute la suite tourne en parallèle.
  }, 15_000);

  it("refuse un PIN trop facile", async () => {
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    await expect(setUserPin(db, "u1", "1234")).rejects.toMatchObject({ code: "WEAK_PIN" });
  });

  it("le PIN ne donne pas les droits de gérant : mot de passe de moins de 15 minutes exigé", async () => {
    const now = new Date("2026-11-07T10:00:00.000Z");
    const manager = await rememberDeviceUser(
      db,
      { userId: "m1", name: "Gérant", role: "manager" },
      now,
    );
    expect(effectiveRole(manager, new Date("2026-11-07T10:10:00.000Z"))).toBe("manager");
    expect(effectiveRole(manager, new Date("2026-11-07T10:16:00.000Z"))).toBe("waiter");
  });
});

describe("appareil", () => {
  it("ENF-09 : la révocation efface toutes les données locales", async () => {
    await saveDevice(db, {
      deviceId: "d1",
      code: "D01",
      token: "secret",
      establishmentId: "e1",
      slug: "resto",
      name: "Resto",
      currency: "CDF",
      timeZone: "Africa/Lubumbashi",
    });
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    await wipeDevice(db);
    expect(await getDevice(db)).toBeNull();
    expect(await db.deviceUsers.count()).toBe(0);
  });

  it("applique les changements reçus d'un autre appareil", async () => {
    await applyChange(db, {
      seq: "1",
      entity: "menu_item",
      entityId: "i1",
      data: {
        id: "i1",
        establishmentId: "e1",
        servicePointId: "sp1",
        name: "Primus 72 cl",
        description: "",
        category: "Bières",
        unit: "bottle",
        price: moneyFromMajor(3500, "CDF"),
        createdAt: "2026-11-07T08:00:00.000Z",
        archivedAt: null,
      },
    });
    await applyChange(db, { seq: "2", entity: "inconnue", entityId: "x", data: {} });
    expect((await db.menuItems.get("i1"))?.name).toBe("Primus 72 cl");
  });
});

describe("personnel diffusé par le serveur (EF-CPT-05)", () => {
  it("un membre suspendu perd l'appareil, même s'il était l'utilisateur actif", async () => {
    await rememberDeviceUser(db, { userId: "u1", name: "Amani", role: "waiter" });
    await setUserPin(db, "u1", "2580");
    await unlockWithPin(db, "u1", "2580");
    await applyStaffMember(db, {
      id: "u1",
      establishmentId: "e1",
      name: "Amani",
      role: "waiter",
      status: "suspended",
    });
    expect(await db.deviceUsers.get("u1")).toBeUndefined();
    expect(await getActiveUserId(db)).toBeNull();
  });

  it("un changement de rôle s'applique aux droits sur l'appareil", async () => {
    await rememberDeviceUser(db, { userId: "m1", name: "Gérant", role: "manager" });
    await applyStaffMember(db, {
      id: "m1",
      establishmentId: "e1",
      name: "Gérant B.",
      role: "waiter",
      status: "active",
    });
    expect(await db.deviceUsers.get("m1")).toMatchObject({ name: "Gérant B.", role: "waiter" });
    expect((await db.staff.get("m1"))?.role).toBe("waiter");
  });
});

describe("modules actifs reçus du serveur (EF-MOD-02)", () => {
  it("inconnus au départ, puis mis à jour par les changements", async () => {
    expect(await getEnabledModules(db)).toBeNull();
    await applyChange(db, {
      seq: "10",
      entity: "establishment_modules",
      entityId: "e1",
      data: { modules: ["restaurant", "catalog", "delivery"] },
    });
    expect(await getEnabledModules(db)).toEqual(["catalog", "delivery", "restaurant"]);
    await applyChange(db, {
      seq: "11",
      entity: "establishment_modules",
      entityId: "e1",
      data: { modules: ["catalog"] },
    });
    expect(await getEnabledModules(db)).toEqual(["catalog"]);
  });
});
