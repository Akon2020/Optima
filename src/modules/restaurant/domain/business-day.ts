import { DEFAULT_TIME_ZONE, localDayKey, localHour } from "@/shared/lib/dates";

/**
 * HYPOTHÈSE D-Q10 : tant que le rythme des clôtures n'est pas tranché, la
 * journée d'exploitation commence à une heure paramétrable (6 h par défaut)
 * et dure 24 heures. Un service qui se prolonge après minuit reste ainsi dans
 * la même journée. Quand D-Q10 sera tranchée, seule cette fonction change.
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
