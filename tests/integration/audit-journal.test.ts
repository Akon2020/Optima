import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { login } from "@/server/auth/login";
import { GLOBAL_SCOPE, exportAuditCsv, listAuditEntries } from "@/server/audit/journal";
import { createStaffMember, suspendStaffMember } from "@/server/staff/staff";
import { registerDevice, revokeDevice } from "@/server/sync/devices";

import {
  PASSWORD,
  createFixtures,
  createTestDb,
  type Fixtures,
  type TestDb,
} from "./helpers/test-db";

/** Journal d'audit consultable (EF-AUD-02 à 04, RG-AUD-01, ENF-08). */
let db: TestDb;
let fx: Fixtures;
let deviceId: string;
let createdUserId: string;

const manager = () => ({ userId: fx.managerA.id, isOwner: false, isElevated: true });
const owner = () => ({ userId: fx.owner.id, isOwner: true, isElevated: true });
const inA = () => ({ kind: "establishment" as const, establishmentId: fx.a.id });
type Filters = {
  domain: string | null;
  action: string | null;
  actorUserId: string | null;
  deviceId: string | null;
  from: string | null;
  to: string | null;
};
const none: Filters = {
  domain: null,
  action: null,
  actorUserId: null,
  deviceId: null,
  from: null,
  to: null,
};

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  // Activité : connexion (journal global), appareil, comptes dans A ; un compte dans B.
  await login(
    db.prisma,
    { identifier: "gerant.a@optima.test", password: PASSWORD },
    { ip: "10.7.0.1" },
  );
  deviceId = (
    await registerDevice(db.prisma, manager(), { establishmentId: fx.a.id, name: "Caisse" })
  ).deviceId;
  await revokeDevice(db.prisma, manager(), {
    establishmentId: fx.a.id,
    deviceId,
    reason: "Appareil perdu",
  });
  createdUserId = (
    await createStaffMember(db.prisma, manager(), {
      establishmentId: fx.a.id,
      name: "=SOMME(A1:A9)",
      identifier: "formule@optima.test",
      role: "waiter",
    })
  ).userId;
  await suspendStaffMember(db.prisma, manager(), {
    establishmentId: fx.a.id,
    userId: createdUserId,
    // Motif piégé : une cellule qui commence par une formule de tableur.
    reason: '=HYPERLINK("http://pirate.test";"Clic")',
  });
  await createStaffMember(db.prisma, owner(), {
    establishmentId: fx.b.id,
    name: "Serveur B2",
    identifier: "b2@optima.test",
    role: "waiter",
  });
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("accès (EF-AUD-03)", () => {
  it("le gérant ne voit que son établissement, sans les connexions globales", async () => {
    const page = await listAuditEntries(db.prisma, manager(), { scope: inA(), filters: none });
    const actions = page.entries.map((entry) => entry.action);
    expect(actions).toEqual([
      "core.staff.suspended",
      "core.staff.created",
      "core.device.revoked",
      "core.device.registered",
    ]);
    expect(page.entries.every((entry) => entry.establishmentName === "Restaurant A")).toBe(true);
    expect(page.entries[0]).toMatchObject({
      label: "Accès suspendu",
      actorName: "gerant.a",
      reason: '=HYPERLINK("http://pirate.test";"Clic")',
    });
    expect(page.options.devices.map((option) => option.label)).toEqual(["D01 · Caisse"]);
    expect(page.options.establishments).toEqual([]);
  });

  it("refuse le serveur et le gérant d'un autre établissement", async () => {
    await expect(
      listAuditEntries(
        db.prisma,
        { userId: fx.waiterA.id, isOwner: false, isElevated: false },
        { scope: inA(), filters: none },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listAuditEntries(db.prisma, manager(), {
        scope: { kind: "establishment", establishmentId: fx.b.id },
        filters: none,
      }),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(
      listAuditEntries(db.prisma, manager(), {
        scope: { kind: "owner", establishmentId: null },
        filters: none,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("le propriétaire voit tout, connexions comprises, et peut cibler", async () => {
    const all = await listAuditEntries(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: null },
      filters: none,
    });
    expect(all.entries.some((entry) => entry.action === "auth.login.succeeded")).toBe(true);
    expect(all.entries.some((entry) => entry.establishmentName === "Restaurant B")).toBe(true);
    const global = await listAuditEntries(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: GLOBAL_SCOPE },
      filters: none,
    });
    expect(global.entries.every((entry) => entry.establishmentName === null)).toBe(true);
    const onlyB = await listAuditEntries(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: fx.b.id },
      filters: none,
    });
    expect(onlyB.entries.map((entry) => entry.action)).toEqual(["core.staff.created"]);
  });
});

describe("filtres et pages (EF-AUD-02)", () => {
  it("filtre par domaine, action, auteur, appareil et dates", async () => {
    const list = (filters: Partial<Filters>) =>
      listAuditEntries(db.prisma, manager(), { scope: inA(), filters: { ...none, ...filters } });
    expect((await list({ domain: "core.device" })).entries).toHaveLength(2);
    expect((await list({ action: "core.staff.created" })).entries).toHaveLength(1);
    expect((await list({ deviceId })).entries.map((entry) => entry.action)).toEqual([
      "core.device.revoked",
      "core.device.registered",
    ]);
    expect((await list({ actorUserId: fx.waiterA.id })).entries).toHaveLength(0);
    expect((await list({ actorUserId: fx.managerA.id })).entries).toHaveLength(4);
    const today = new Date().toISOString().slice(0, 10);
    expect((await list({ from: "2000-01-01", to: "2000-01-02" })).entries).toHaveLength(0);
    // Valeurs invalides ignorées, jamais envoyées telles quelles à la base.
    expect(
      (await list({ deviceId: "pas-un-uuid", domain: "inconnu", from: "hier" })).entries,
    ).toHaveLength(4);
    expect((await list({ from: "2000-01-01", to: "2999-12-31" })).entries).toHaveLength(4);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("avance page par page sans doublon", async () => {
    const first = await listAuditEntries(db.prisma, manager(), {
      scope: inA(),
      filters: none,
      limit: 3,
    });
    expect(first.entries).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await listAuditEntries(db.prisma, manager(), {
      scope: inA(),
      filters: none,
      limit: 3,
      before: first.nextCursor,
    });
    expect(second.entries.map((entry) => entry.action)).toEqual(["core.device.registered"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("export CSV (EF-AUD-04)", () => {
  it("exporte pour Excel, neutralise les formules et s'inscrit au journal", async () => {
    const result = await exportAuditCsv(
      db.prisma,
      manager(),
      { scope: inA(), filters: { ...none, domain: "core.staff" } },
      { ip: "10.7.0.2", now: new Date("2026-11-08T10:00:00.000Z") },
    );
    expect(result.filename).toBe("journal-audit-2026-11-08.csv");
    expect(result.count).toBe(2);
    expect(result.csv.startsWith("﻿Date;Heure;Action;Auteur;")).toBe(true);
    expect(result.csv).toContain("Accès suspendu");
    // Une cellule qui commence par une formule est neutralisée par une apostrophe.
    expect(result.csv).toContain(`"'=HYPERLINK(""http://pirate.test"";""Clic"")"`);
    expect(result.csv).not.toMatch(/(^|;)"?=/m);

    const page = await listAuditEntries(db.prisma, manager(), { scope: inA(), filters: none });
    expect(page.entries[0]).toMatchObject({
      action: "core.audit.exported",
      label: "Journal exporté",
    });
  });

  it("l'export du propriétaire sur tous les établissements va au journal global", async () => {
    const result = await exportAuditCsv(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: null },
      filters: none,
    });
    expect(result.csv.split("\r\n")[0]).toContain("Établissement");
    const global = await listAuditEntries(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: GLOBAL_SCOPE },
      filters: { ...none, action: "owner.audit.exported" },
    });
    expect(global.entries).toHaveLength(1);
  });
});
