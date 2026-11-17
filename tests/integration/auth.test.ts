import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decryptSecret } from "@/server/auth/crypto";
import {
  beginTotpSetup,
  changePassword,
  confirmTotpSetup,
  login,
  verifySecondFactor,
} from "@/server/auth/login";
import { validateSession, revokeAllSessions } from "@/server/auth/sessions";
import { totpCode } from "@/server/auth/totp";
import { authorize } from "@/server/authz/authorize";

import {
  PASSWORD,
  createFixtures,
  createTestDb,
  type Fixtures,
  type TestDb,
} from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
const KEY = randomBytes(32).toString("base64");
const meta = (ip = "10.0.0.1") => ({ ip, userAgent: "vitest" });

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

describe("connexion (EF-AUT-01, RG-AUT-02)", () => {
  it("connecte un membre et ouvre une session valide", async () => {
    const result = await login(
      db.prisma,
      { identifier: "Serveur.A@optima.test", password: PASSWORD },
      meta(),
    );
    expect(result).toMatchObject({ status: "ok", next: "home" });
    if (result.status !== "ok") return;
    const session = await validateSession(db.prisma, result.token);
    expect(session?.user.id).toBe(fx.waiterA.id);
    expect(session?.isElevated).toBe(true);
  });

  it("répond de la même façon pour un compte inconnu et un mauvais mot de passe", async () => {
    const unknown = await login(
      db.prisma,
      { identifier: "personne@optima.test", password: PASSWORD },
      meta("10.0.0.2"),
    );
    const wrong = await login(
      db.prisma,
      { identifier: "serveur.a@optima.test", password: "faux mot de passe" },
      meta("10.0.0.2"),
    );
    expect(unknown).toEqual({ status: "invalid" });
    expect(wrong).toEqual({ status: "invalid" });
  });

  it("bloque le compte après 5 échecs en 15 minutes, même avec le bon mot de passe", async () => {
    for (let index = 0; index < 5; index += 1) {
      await login(
        db.prisma,
        { identifier: "serveur.b@optima.test", password: "mauvais" },
        meta(`10.1.0.${index}`),
      );
    }
    const result = await login(
      db.prisma,
      { identifier: "serveur.b@optima.test", password: PASSWORD },
      meta("10.1.1.1"),
    );
    expect(result).toEqual({ status: "locked" });
  });

  it("trace les connexions dans le journal d'audit", async () => {
    await db.asAdmin();
    const entries = await db.prisma.auditLog.count({ where: { action: "auth.login.failed" } });
    await db.asApp();
    expect(entries).toBeGreaterThan(0);
  });
});

describe("sessions (RG-AUT-03, EF-CPT-01)", () => {
  it("expire après inactivité", async () => {
    const result = await login(
      db.prisma,
      { identifier: "gerant.a@optima.test", password: PASSWORD },
      meta("10.2.0.1"),
    );
    if (result.status !== "ok") throw new Error("connexion attendue");
    const later = new Date(Date.now() + 13 * 60 * 60_000);
    expect(await validateSession(db.prisma, result.token, later)).toBeNull();
  });

  it("la déconnexion forcée ferme toutes les sessions", async () => {
    const result = await login(
      db.prisma,
      { identifier: "gerant.a@optima.test", password: PASSWORD },
      meta("10.2.0.2"),
    );
    if (result.status !== "ok") throw new Error("connexion attendue");
    await revokeAllSessions(db.prisma, fx.managerA.id);
    expect(await validateSession(db.prisma, result.token)).toBeNull();
  });
});

describe("mot de passe provisoire (EF-AUT-02)", () => {
  it("impose le changement, refuse un mot de passe faible, puis accepte", async () => {
    await db.asAdmin();
    await db.prisma.user.update({
      where: { id: fx.waiterA.id },
      data: { mustChangePassword: true },
    });
    await db.asApp();
    const result = await login(
      db.prisma,
      { identifier: "serveur.a@optima.test", password: PASSWORD },
      meta("10.3.0.1"),
    );
    expect(result).toMatchObject({ status: "ok", next: "change-password" });
    if (result.status !== "ok") return;
    await expect(
      changePassword(
        db.prisma,
        { token: result.token, currentPassword: PASSWORD, newPassword: "court" },
        meta(),
      ),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    const next = await changePassword(
      db.prisma,
      { token: result.token, currentPassword: PASSWORD, newPassword: "Une phrase solide 2026" },
      meta(),
    );
    expect(next).toBe("home");
  });
});

describe("double authentification du propriétaire (EF-AUT-03)", () => {
  it("exige l'activation, puis le code à chaque connexion ; un code de secours ne sert qu'une fois", async () => {
    const first = await login(
      db.prisma,
      { identifier: "proprietaire@optima.test", password: PASSWORD },
      meta("10.4.0.1"),
    );
    expect(first).toMatchObject({ status: "ok", next: "totp-setup" });
    if (first.status !== "ok") return;

    // Session non élevée : aucun accès aux établissements.
    await expect(
      authorize(
        db.prisma,
        { userId: fx.owner.id, isOwner: true, isElevated: false },
        "restaurant.menu.read",
        {
          establishmentId: fx.a.id,
        },
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });

    const { secret } = await beginTotpSetup(
      db.prisma,
      { token: first.token, encryptionKey: KEY },
      meta(),
    );
    await db.asAdmin();
    const stored = await db.prisma.user.findUniqueOrThrow({ where: { id: fx.owner.id } });
    await db.asApp();
    expect(stored.totpSecretEnc).not.toContain(secret);
    expect(decryptSecret(stored.totpSecretEnc ?? "", KEY)).toBe(secret);

    await expect(
      confirmTotpSetup(
        db.prisma,
        { token: first.token, code: "000000", encryptionKey: KEY },
        meta(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
    const confirmed = await confirmTotpSetup(
      db.prisma,
      { token: first.token, code: totpCode(secret, Date.now()), encryptionKey: KEY },
      meta(),
    );
    expect(confirmed.recoveryCodes).toHaveLength(8);
    expect((await validateSession(db.prisma, confirmed.token))?.isElevated).toBe(true);
    // Rotation : l'ancien jeton ne vaut plus rien.
    expect(await validateSession(db.prisma, first.token)).toBeNull();

    const second = await login(
      db.prisma,
      { identifier: "proprietaire@optima.test", password: PASSWORD },
      meta("10.4.0.2"),
    );
    expect(second).toMatchObject({ status: "ok", next: "totp" });
    if (second.status !== "ok") return;
    const recovery = confirmed.recoveryCodes[0] ?? "";
    const elevated = await verifySecondFactor(
      db.prisma,
      { token: second.token, code: recovery, encryptionKey: KEY },
      meta(),
    );
    expect((await validateSession(db.prisma, elevated.token))?.isElevated).toBe(true);

    const third = await login(
      db.prisma,
      { identifier: "proprietaire@optima.test", password: PASSWORD },
      meta("10.4.0.3"),
    );
    if (third.status !== "ok") return;
    await expect(
      verifySecondFactor(
        db.prisma,
        { token: third.token, code: recovery, encryptionKey: KEY },
        meta(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
  });
});
