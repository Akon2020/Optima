/**
 * Dates (CLAUDE.md § 3.8 et § 3.14).
 *
 * Les instants sont manipulés en ISO 8601 UTC. L'affichage se fait toujours
 * dans le fuseau de l'établissement (Africa/Lubumbashi pour Bukavu), au
 * format français jj/mm/aaaa (ENF-15).
 */

export const DEFAULT_TIME_ZONE = "Africa/Lubumbashi";

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat("fr-FR", { timeZone, ...options });
    cache.set(key, value);
  }
  return value;
}

export function formatDate(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  return formatter(timeZone, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  return formatter(timeZone, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatLongDate(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  return formatter(timeZone, { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso),
  );
}

/** Heure locale (0 à 23) d'un instant dans le fuseau de l'établissement. */
export function localHour(iso: string, timeZone = DEFAULT_TIME_ZONE): number {
  const hour = formatter(timeZone, { hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number.parseInt(hour, 10);
}

/** Date locale au format AAAA-MM-JJ, utile pour regrouper par journée. */
export function localDayKey(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Année locale, utilisée par la numérotation des documents (EF-DOC-01). */
export function localYear(iso: string, timeZone = DEFAULT_TIME_ZONE): number {
  return Number.parseInt(localDayKey(iso, timeZone).slice(0, 4), 10);
}

/** Durée écoulée lisible : « 4 min », « 1 h 05 ». */
export function formatElapsed(fromIso: string, nowIso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Instant passé, lisible : « à l'instant », « il y a 12 min »,
 * « aujourd'hui à 14:05 », « le 06/11/2026 à 18:30 ».
 */
export function formatRelativeInstant(
  iso: string,
  nowIso: string,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const time = formatTime(iso, timeZone);
  if (localDayKey(iso, timeZone) === localDayKey(nowIso, timeZone)) {
    const elapsed = new Date(nowIso).getTime() - new Date(iso).getTime();
    if (elapsed < 60_000) return "à l'instant";
    if (elapsed < 3_600_000) return `il y a ${formatElapsed(iso, nowIso)}`;
    return `aujourd'hui à ${time}`;
  }
  return `le ${formatDate(iso, timeZone)} à ${time}`;
}

/** Décalage (ms) du fuseau par rapport à UTC à un instant donné. */
function timeZoneOffsetMs(instant: number, timeZone: string): number {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Début (ISO UTC) d'une date locale AAAA-MM-JJ dans le fuseau donné, par
 * exemple pour filtrer « du 07/11/2026 » à Bukavu. `null` si la date est invalide.
 */
export function zonedDayStart(dayKey: string, timeZone = DEFAULT_TIME_ZONE): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const guess = Date.UTC(year, month - 1, day);
  if (new Date(guess).getUTCDate() !== day) return null;
  const first = guess - timeZoneOffsetMs(guess, timeZone);
  // Second passage : exact même si le décalage change ce jour-là.
  return new Date(guess - timeZoneOffsetMs(first, timeZone)).toISOString();
}
