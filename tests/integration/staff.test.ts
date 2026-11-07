import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { login } from "@/server/auth/login";
import { createSession, validateSession } from "@/server/auth/sessions";
import { authorize } from "@/server/authz/authorize";
import { verifyDeviceUser } from "@/server/auth/device-users";
import { withContext } from "@/server/db/context";
import {
  createStaffMember,
  listStaff,
  reactivateStaffMember,
  resetStaffPassword,
  signOutStaffMember,
  suspendStaffMember,
  updateStaffMember,
} from "@/server/staff/staff";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pullChanges } from "@/server/sync/pull";

import {
  PASSWORD,
  createFixtures,
  createTestDb,
  type Fixtures,
  type TestDb,
} from "./helpers/test-db";

/** Écran « Équipe » (EF-CPT-01 à 05, EF-AUT-02, EF-AUT-04). */
let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;

const manager = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });
const owner = () => ({ userId: fx.owner.id, isOwner: true, isElevated: true });
const meta = { ip: "10.4.0.1" };

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const registered = await registerDevice(db.prisma, manager(), {
    establishmentId: fx.a.id,
    name: "Téléphone salle",
  });
  const authenticated = await authenticateDevice(db.prisma, `Device ${registered.token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("liste du personnel (EF-CPT-02)", () => {
  it("montre le personnel de l'établissement seulement, avec ce que le gérant peut gérer", async () => {
    const overview = await listStaff(db.prisma, manager(), { establishmentId: fx.a.id });
    expect(overview.members.map((member) => member.email).sort()).toEqual([
      "gerant.a@optima.test",
      "serveur.a@optima.test",
    ]);
    expect(overview.assignableRoles).not.toContain("manager");
    const self = overview.members.find((member) => member.userId === fx.managerA.id);
    const waiter = overview.members.find((member) => member.userId === fx.waiterA.id);
    expect(self?.canManage).toBe(false);
    expect(waiter?.canManage).toBe(true);
    expect(overview.servicePoints.map((point) => point.name)).toEqual(["Comptoir", "Cuisine"]);
  });

  it("est refusée au serveur et au gérant d'un autre établissement", async () => {
    await expect(
      listStaff(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: false },
        { establishmentId: fx.a.id },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listStaff(db.prisma, manager(), { establishmentId: fx.b.id }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });
});

describe("création d'un compte (EF-AUT-02)", () => {
  it("crée un compte provisoire, utilisable une fois le mot de passe changé", async () => {
    const created = await createStaffMember(
      db.prisma,
      manager(),
      {
        establishmentId: fx.a.id,
        name: "  Amani   K. ",
        identifier: "+243 990 000 001",
        role: "waiter",
      },
      meta,
    );
    expect(created.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    const result = await login(
      db.prisma,
      { identifier: "+243990000001", password: created.temporaryPassword },
      { ip: "10.4.0.9" },
    );
    expect(result).toMatchObject({ status: "ok", next: "change-password" });

    const overview = await listStaff(db.prisma, manager(), { establishmentId: fx.a.id });
    expect(overview.members.find((member) => member.userId === created.userId)).toMatchObject({
      name: "Amani K.",
      phone: "+243990000001",
      role: "waiter",
      mustChangePassword: true,
    });
  });

  it("refuse un identifiant déjà pris, un gérant créé par un gérant, un poste manquant", async () => {
    await expect(
      createStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        name: "Doublon",
        identifier: "SERVEUR.B@optima.test",
        role: "waiter",
      }),
    ).rejects.toMatchObject({ code: "IDENTIFIER_TAKEN" });
    await expect(
      createStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        name: "Second gérant",
        identifier: "gerant.bis@optima.test",
        role: "manager",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        name: "Cuisine",
        identifier: "cuisine@optima.test",
        role: "prep",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_POINT_REQUIRED" });
    // Un point de service d'un autre établissement n'est pas accepté (IDOR).
    await expect(
      createStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        name: "Cuisine",
        identifier: "cuisine@optima.test",
        role: "prep",
        servicePointId: fx.b.kitchen.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("le propriétaire crée un gérant", async () => {
    const created = await createStaffMember(db.prisma, owner(), {
      establishmentId: fx.a.id,
      name: "Gérant adjoint",
      identifier: "adjoint@optima.test",
      role: "manager",
    });
    const overview = await listStaff(db.prisma, manager(), { establishmentId: fx.a.id });
    expect(overview.members.find((member) => member.userId === created.userId)).toMatchObject({
      role: "manager",
      canManage: false,
    });
    await expect(
      resetStaffPassword(db.prisma, manager(), {
        establishmentId: fx.a.id,
        userId: created.userId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("modification, réinitialisation, suspension", () => {
  it("un changement de rôle ferme les sessions et suit sur les appareils", async () => {
    const session = await createSession(db.prisma, {
      userId: fx.waiterA.id,
      isOwner: false,
      isElevated: true,
      ip: "10.4.0.2",
    });
    await updateStaffMember(db.prisma, manager(), {
      establishmentId: fx.a.id,
      userId: fx.waiterA.id,
      name: "Serveur A",
      role: "prep",
      servicePointId: fx.a.kitchen.id,
    });
    expect(await validateSession(db.prisma, session.token)).toBeNull();
    const { changes } = await pullChanges(db.prisma, device, null);
    expect(changes.filter((change) => change.entity === "staff_member").at(-1)?.data).toMatchObject(
      { id: fx.waiterA.id, name: "Serveur A", role: "prep", status: "active" },
    );
    await updateStaffMember(db.prisma, manager(), {
      establishmentId: fx.a.id,
      userId: fx.waiterA.id,
      name: "Serveur A",
      role: "waiter",
    });
  });

  it("la réinitialisation remplace le mot de passe et l'impose au changement (EF-AUT-04)", async () => {
    const { temporaryPassword } = await resetStaffPassword(db.prisma, manager(), {
      establishmentId: fx.a.id,
      userId: fx.waiterA.id,
    });
    const old = await login(
      db.prisma,
      { identifier: "serveur.a@optima.test", password: PASSWORD },
      { ip: "10.4.0.3" },
    );
    expect(old.status).toBe("invalid");
    const fresh = await login(
      db.prisma,
      { identifier: "serveur.a@optima.test", password: temporaryPassword },
      { ip: "10.4.0.3" },
    );
    expect(fresh).toMatchObject({ status: "ok", next: "change-password" });
  });

  it("la suspension ferme l'accès tout de suite et garde le motif (EF-CPT-05)", async () => {
    await expect(
      suspendStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        userId: fx.waiterA.id,
        reason: "",
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    const session = await createSession(db.prisma, {
      userId: fx.waiterA.id,
      isOwner: false,
      isElevated: true,
      ip: "10.4.0.4",
    });
    await suspendStaffMember(
      db.prisma,
      manager(),
      { establishmentId: fx.a.id, userId: fx.waiterA.id, reason: "Départ" },
      meta,
    );
    expect(await validateSession(db.prisma, session.token)).toBeNull();
    await expect(
      authorize(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: true },
        "restaurant.order.create",
        { establishmentId: fx.a.id },
      ),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(
      verifyDeviceUser(
        db.prisma,
        device,
        {
          identifier: "serveur.a@optima.test",
          password: "peu importe",
        },
        meta,
      ),
    ).rejects.toBeDefined();

    const overview = await listStaff(db.prisma, manager(), { establishmentId: fx.a.id });
    expect(overview.members.find((member) => member.userId === fx.waiterA.id)).toMatchObject({
      status: "suspended",
      suspendedReason: "Départ",
    });
    const { changes } = await pullChanges(db.prisma, device, null);
    expect(changes.filter((change) => change.entity === "staff_member").at(-1)?.data).toMatchObject(
      { id: fx.waiterA.id, status: "suspended" },
    );
    const audit = await withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, (tx) =>
      tx.auditLog.findFirst({ where: { action: "core.staff.suspended", entityId: fx.waiterA.id } }),
    );
    expect(audit).toMatchObject({ reason: "Départ", actorUserId: fx.managerA.id, ip: "10.4.0.1" });

    await expect(
      resetStaffPassword(db.prisma, manager(), { establishmentId: fx.a.id, userId: fx.waiterA.id }),
    ).rejects.toMatchObject({ code: "SUSPENDED" });
    await reactivateStaffMember(db.prisma, manager(), {
      establishmentId: fx.a.id,
      userId: fx.waiterA.id,
    });
    await expect(
      authorize(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: true },
        "restaurant.order.create",
        { establishmentId: fx.a.id },
      ),
    ).resolves.toMatchObject({ role: "waiter" });
  });

  it("déconnexion forcée et refus d'agir sur soi-même ou ailleurs", async () => {
    await createSession(db.prisma, {
      userId: fx.waiterA.id,
      isOwner: false,
      isElevated: true,
      ip: "10.4.0.5",
    });
    await expect(
      signOutStaffMember(db.prisma, manager(), { establishmentId: fx.a.id, userId: fx.waiterA.id }),
    ).resolves.toEqual({ sessions: 1 });
    await expect(
      suspendStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        userId: fx.managerA.id,
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      suspendStaffMember(db.prisma, manager(), {
        establishmentId: fx.a.id,
        userId: fx.waiterB.id,
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
