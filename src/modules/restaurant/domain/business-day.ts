import { DEFAULT_TIME_ZONE, localDayKey, localHour } from "@/shared/lib/dates";

/**
 * Journée d'exploitation (D-039) : du stock du matin à la clôture validée.
 * Pour situer une vente ou une saisie dans une journée, le repère reste une
 * heure paramétrable (6 h par défaut) : un service qui se prolonge après
 * minuit reste dans la même journée. Une fois la journée validée, ce qui suit
 * appartient à la journée suivante (`currentDayKey`, D-056).
 */
export const DEFAULT_BUSINESS_DAY_START_HOUR = 6;

const HOUR_MS = 3_600_000;

/** Début (ISO UTC) de la journée d'exploitation qui contient `nowIso`. */
export function businessDayStart(
  nowIso: string,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const now = new Date(nowIso);
  const hour = localHour(nowIso, timeZone);
  const hoursSinceStart = (hour - startHour + 24) % 24;
  const start = new Date(now.getTime() - hoursSinceStart * HOUR_MS);
  start.setUTCMinutes(0, 0, 0);
  return start.toISOString();
}

/** Clé AAAA-MM-JJ de la journée d'exploitation (date locale de son début). */
export function businessDayKey(
  nowIso: string,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return localDayKey(businessDayStart(nowIso, startHour, timeZone), timeZone);
}

export function isInBusinessDay(
  iso: string,
  nowIso: string,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): boolean {
  const start = new Date(businessDayStart(nowIso, startHour, timeZone)).getTime();
  const time = new Date(iso).getTime();
  return time >= start && time < start + 24 * HOUR_MS;
}

/** Journée suivante (`2026-11-14` donne `2026-11-15`). */
export function nextDayKey(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Début (ISO UTC) de la journée d'exploitation de clé `day`. */
export function businessDayStartOf(
  day: string,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  let start = businessDayStart(`${day}T12:00:00.000Z`, startHour, timeZone);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const key = localDayKey(start, timeZone);
    if (key === day) return start;
    const shift = key < day ? 24 : -24;
    start = new Date(new Date(start).getTime() + shift * HOUR_MS).toISOString();
  }
  return start;
}

/**
 * Journée à laquelle rattacher une déclaration faite à `nowIso` (D-039) : la
 * journée en cours, sauf si le gérant l'a déjà validée ; ce qui suit la
 * validation appartient alors à la journée suivante.
 */
export function currentDayKey(
  nowIso: string,
  validatedDays: ReadonlySet<string>,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  let day = businessDayKey(nowIso, startHour, timeZone);
  while (validatedDays.has(day)) day = nextDayKey(day);
  return day;
}

/**
 * Journée à laquelle appartient un fait daté `iso` (vente, paiement), D-039 :
 * sa journée d'exploitation, sauf s'il suit la validation de celle-ci ; il
 * passe alors à la journée suivante (et ainsi de suite).
 */
export function operatingDayOf(
  iso: string,
  validatedAtByDay: ReadonlyMap<string, string>,
  startHour = DEFAULT_BUSINESS_DAY_START_HOUR,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  let day = businessDayKey(iso, startHour, timeZone);
  let validatedAt = validatedAtByDay.get(day);
  while (validatedAt !== undefined && iso > validatedAt) {
    day = nextDayKey(day);
    validatedAt = validatedAtByDay.get(day);
  }
  return day;
}
