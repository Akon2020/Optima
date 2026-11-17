import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { login } from "@/server/auth/login";
import ExcelJS from "exceljs";
import { chromium } from "playwright-core";

import { GLOBAL_SCOPE, exportAudit, listAuditEntries } from "@/server/audit/journal";
import { closePdfBrowser } from "@/server/exports/pdf";
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
  await closePdfBrowser();
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

/** Navigateur local pour le PDF : le test PDF est sauté s'il n'y en a pas (intégration continue). */
const pdfChannel = process.env.PDF_BROWSER_CHANNEL ?? "chrome";
const hasPdfBrowser = await chromium
  .launch({ channel: pdfChannel, headless: true })
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

const text = (base64: string) => Buffer.from(base64, "base64").toString("utf8");

describe("exports (EF-AUD-04)", () => {
  it("CSV : lisible par Excel, formules neutralisées, export inscrit au journal", async () => {
    const result = await exportAudit(
      db.prisma,
      manager(),
      { scope: inA(), filters: { ...none, domain: "core.staff" }, format: "csv" },
      { ip: "10.7.0.2", now: new Date("2026-11-08T10:00:00.000Z") },
    );
    expect(result).toMatchObject({
      filename: "journal-audit-2026-11-08.csv",
      mimeType: "text/csv;charset=utf-8",
      count: 2,
    });
    const csv = text(result.base64);
    expect(csv.startsWith("\uFEFFDate;Heure;Action;Auteur;")).toBe(true);
    expect(csv).toContain("Accès suspendu");
    // Une cellule qui commence par une formule est neutralisée par une apostrophe.
    expect(csv).toContain(`"'=HYPERLINK(""http://pirate.test"";""Clic"")"`);
    expect(csv).not.toMatch(/(^|;)"?=/m);

    const page = await listAuditEntries(db.prisma, manager(), { scope: inA(), filters: none });
    expect(page.entries[0]).toMatchObject({
      action: "core.audit.exported",
      label: "Journal exporté",
    });
    expect(page.entries[0]?.changes).toContainEqual({
      field: "Format",
      before: null,
      after: "csv",
    });
  });

  it("Excel : classeur titré, en-tête figé, aucune cellule transformée en formule", async () => {
    const result = await exportAudit(db.prisma, manager(), {
      scope: inA(),
      filters: { ...none, domain: "core.staff" },
      format: "xlsx",
    });
    expect(result.filename).toMatch(/\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    const bytes = Buffer.from(result.base64, "base64");
    await workbook.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    const sheet = workbook.getWorksheet("Journal");
    if (!sheet) throw new Error("feuille attendue");
    expect(sheet.getCell("A1").value).toBe("Journal d'audit");
    expect(sheet.getCell("A2").value).toBe("Établissement : Restaurant A");
    const values: unknown[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values).toContain("Accès suspendu");
    // Le motif piégé reste un texte : ExcelJS ne produit pas de formule.
    expect(values).toContain('=HYPERLINK("http://pirate.test";"Clic")');
    expect(
      values.some((value) => typeof value === "object" && value !== null && "formula" in value),
    ).toBe(false);
    expect(sheet.views[0]).toMatchObject({ state: "frozen" });
  });

  it.runIf(hasPdfBrowser)("PDF : document A4 généré par le navigateur", async () => {
    process.env.PDF_BROWSER_CHANNEL = pdfChannel;
    const result = await exportAudit(db.prisma, manager(), {
      scope: inA(),
      filters: none,
      format: "pdf",
    });
    const pdf = Buffer.from(result.base64, "base64");
    expect(result.mimeType).toBe("application/pdf");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("refuse un format inconnu", async () => {
    await expect(
      exportAudit(db.prisma, manager(), {
        scope: inA(),
        filters: none,
        format: "docx" as "csv",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("l'export du propriétaire sur tous les établissements va au journal global", async () => {
    const result = await exportAudit(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: null },
      filters: none,
      format: "csv",
    });
    expect(text(result.base64).split("\r\n")[0]).toContain("Établissement");
    const global = await listAuditEntries(db.prisma, owner(), {
      scope: { kind: "owner", establishmentId: GLOBAL_SCOPE },
      filters: { ...none, action: "owner.audit.exported" },
    });
    expect(global.entries).toHaveLength(1);
  });
});
