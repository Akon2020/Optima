import { DomainError } from "@/shared/lib/errors";
import { MAX_PIN_ATTEMPTS, checkPinPolicy, createPinVerifier, verifyPin } from "@/offline/pin";

import type { StaffMember } from "../domain/types";
import type { RestaurantRole } from "../permissions";
import type { RestaurantDb, DeviceUserRecord } from "./db";

/**
 * Appareil appairé et utilisateurs de l'appareil (CLAUDE.md § 5.1, § 5.2).
 * Le jeton d'appareil reste dans la base locale de l'établissement ; il est
 * effacé à la révocation (ENF-09).
 */
export type DeviceInfo = {
  deviceId: string;
  code: string;
  token: string;
  establishmentId: string;
  slug: string;
  name: string;
  currency: string;
  timeZone: string;
};

const DEVICE_KEY = "device";
const ACTIVE_USER_KEY = "active-user";
const CURSOR_KEY = "sync-cursor";
const MODULES_KEY = "modules";

/** Délai pendant lequel un gérant connecté par mot de passe garde ses droits de gérant. */
export const PASSWORD_FRESH_MS = 15 * 60_000;

async function readJson<T>(db: RestaurantDb, key: string): Promise<T | null> {
  const row = await db.meta.get(key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function getDevice(db: RestaurantDb): Promise<DeviceInfo | null> {
  return readJson<DeviceInfo>(db, DEVICE_KEY);
}

export async function saveDevice(db: RestaurantDb, device: DeviceInfo): Promise<void> {
  await db.meta.put({ key: DEVICE_KEY, value: JSON.stringify(device) });
}

export async function getCursor(db: RestaurantDb): Promise<string> {
  return (await db.meta.get(CURSOR_KEY))?.value ?? "0";
}

export async function saveCursor(db: RestaurantDb, cursor: string): Promise<void> {
  await db.meta.put({ key: CURSOR_KEY, value: cursor });
}

/**
 * Modules actifs de l'établissement (EF-MOD-02), reçus du serveur. `null`
 * tant que l'appareil ne les connaît pas : rien n'est alors masqué.
 */
export async function getEnabledModules(db: RestaurantDb): Promise<string[] | null> {
  return readJson<string[]>(db, MODULES_KEY);
}

export async function saveEnabledModules(
  db: RestaurantDb,
  modules: readonly string[],
): Promise<void> {
  await db.meta.put({ key: MODULES_KEY, value: JSON.stringify([...modules].sort()) });
}

/** ENF-09 : un appareil révoqué perd toutes ses données locales. */
export async function wipeDevice(db: RestaurantDb): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

export async function getActiveUserId(db: RestaurantDb): Promise<string | null> {
  return (await db.meta.get(ACTIVE_USER_KEY))?.value ?? null;
}

export async function setActiveUser(db: RestaurantDb, userId: string | null): Promise<void> {
  if (userId === null) await db.meta.delete(ACTIVE_USER_KEY);
  else await db.meta.put({ key: ACTIVE_USER_KEY, value: userId });
}

/** État d'un membre diffusé par le serveur (gestion du personnel). */
export type StaffMemberChange = StaffMember & { status: "active" | "suspended" };

/**
 * EF-CPT-05 : un membre suspendu disparaît de l'appareil (plus de reprise de
 * main par PIN) ; un changement de nom ou de rôle s'applique aussitôt, y
 * compris aux droits de l'utilisateur actif.
 */
export async function applyStaffMember(db: RestaurantDb, member: StaffMemberChange): Promise<void> {
  await db.transaction("rw", db.staff, db.deviceUsers, db.meta, async () => {
    if (member.status === "suspended") {
      await db.staff.delete(member.id);
      await db.deviceUsers.delete(member.id);
      if ((await getActiveUserId(db)) === member.id) await setActiveUser(db, null);
      return;
    }
    await db.staff.put({
      id: member.id,
      establishmentId: member.establishmentId,
      name: member.name,
      role: member.role,
    });
    await db.deviceUsers.update(member.id, { name: member.name, role: member.role });
  });
}

/** Retire de l'appareil les utilisateurs qui ne font plus partie du personnel actif. */
export async function pruneDeviceUsers(
  db: RestaurantDb,
  staff: readonly StaffMember[],
): Promise<void> {
  const active = new Map(staff.map((member) => [member.id, member]));
  for (const user of await db.deviceUsers.toArray()) {
    const member = active.get(user.userId);
    if (!member) {
      await db.deviceUsers.delete(user.userId);
      if ((await getActiveUserId(db)) === user.userId) await setActiveUser(db, null);
    } else if (member.role !== user.role || member.name !== user.name) {
      await db.deviceUsers.update(user.userId, { name: member.name, role: member.role });
    }
  }
}

/** Utilisateur dont le mot de passe vient d'être vérifié en ligne. */
export async function rememberDeviceUser(
  db: RestaurantDb,
  user: { userId: string; name: string; role: DeviceUserRecord["role"] },
  now: Date = new Date(),
): Promise<DeviceUserRecord> {
  const existing = await db.deviceUsers.get(user.userId);
  const record: DeviceUserRecord = {
    userId: user.userId,
    name: user.name,
    role: user.role,
    pinVerifier: existing?.pinVerifier ?? null,
    failedPinAttempts: 0,
    lockedAt: null,
    passwordVerifiedAt: now.toISOString(),
  };
  await db.deviceUsers.put(record);
  return record;
}

export async function setUserPin(db: RestaurantDb, userId: string, pin: string): Promise<void> {
  const error = checkPinPolicy(pin);
  if (error) throw new DomainError("WEAK_PIN", error);
  const user = await db.deviceUsers.get(userId);
  if (!user) throw new DomainError("USER_NOT_FOUND", "Utilisateur inconnu sur cet appareil.");
  await db.deviceUsers.update(userId, {
    pinVerifier: await createPinVerifier(pin),
    failedPinAttempts: 0,
    lockedAt: null,
  });
}

/**
 * Reprise de main par PIN (EF-AUT-05). Après 5 erreurs, l'utilisateur est
 * verrouillé : seul son mot de passe, vérifié en ligne, le déverrouille.
 */
export async function unlockWithPin(
  db: RestaurantDb,
  userId: string,
  pin: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; remaining: number; isLocked: boolean }> {
  const user = await db.deviceUsers.get(userId);
  if (!user?.pinVerifier || user.lockedAt) return { ok: false, remaining: 0, isLocked: true };
  if (await verifyPin(pin, user.pinVerifier)) {
    await db.deviceUsers.update(userId, { failedPinAttempts: 0 });
    await setActiveUser(db, userId);
    return { ok: true };
  }
  const failed = user.failedPinAttempts + 1;
  const isLocked = failed >= MAX_PIN_ATTEMPTS;
  await db.deviceUsers.update(userId, {
    failedPinAttempts: failed,
    lockedAt: isLocked ? now.toISOString() : null,
  });
  return { ok: false, remaining: Math.max(0, MAX_PIN_ATTEMPTS - failed), isLocked };
}

/**
 * Rôle effectif sur l'appareil : le PIN ne remplace jamais le mot de passe
 * pour les actions de gérant (CLAUDE.md § 5.1). Un gérant entré par PIN agit
 * comme un serveur tant qu'il n'a pas reconfirmé son mot de passe.
 */
export function effectiveRole(user: DeviceUserRecord, now: Date = new Date()): RestaurantRole {
  if (user.role !== "manager") return user.role;
  const isFresh = now.getTime() - new Date(user.passwordVerifiedAt).getTime() < PASSWORD_FRESH_MS;
  return isFresh ? "manager" : "waiter";
}
