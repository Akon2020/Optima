/**
 * Limitation de débit en mémoire, par clé, sur une fenêtre glissante
 * (CLAUDE.md § 5.6). Suffisante pour un seul serveur ; à remplacer par un
 * stockage partagé si plusieurs instances tournent un jour.
 */
const buckets = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

export const SYNC_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;
