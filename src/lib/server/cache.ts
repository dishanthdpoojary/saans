import "server-only";

/**
 * In-process TTL cache with:
 *  - in-flight de-duplication (N concurrent requests → 1 upstream call)
 *  - stale-on-error: if a refresh fails, the last good value is served and flagged stale
 * On serverless this is per-instance; CDN `s-maxage` headers on routes add a shared layer.
 */

interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;
const STALE_GRACE_MS = 6 * 60 * 60 * 1000;

export interface Cached<T> {
  value: T;
  stale: boolean;
  storedAt: number;
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Cached<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return { value: hit.value, stale: false, storedAt: hit.storedAt };

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const value = await p;
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
    store.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs });
    return { value, stale: false, storedAt: Date.now() };
  } catch (e) {
    if (hit && now - hit.storedAt < STALE_GRACE_MS) return { value: hit.value, stale: true, storedAt: hit.storedAt };
    throw e;
  }
}

/** Round coordinates so nearby requests share cache entries (~1 km grid). */
export const coordKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
