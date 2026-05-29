/**
 * Sync-init wrapper over the async SQLite settings store (SSOT).
 *
 * Use ONLY for hot-path UI prefs that need synchronous `useState` init
 * (tight engines — SpeedReader, TTS). For anything else, call
 * `getSetting`/`putSetting` directly.
 *
 * Contract:
 *  • SQLite settings (`@/lib/db/queries`) is the SSOT.
 *  • localStorage is a sync write-through MIRROR of the SSOT — it exists
 *    only so `useState(loader)` initializers don't return a stale default
 *    on first render. It is never queried in isolation.
 *  • Read path:
 *      1. RAM cache (Map)             — hit, return.
 *      2. localStorage (sync mirror)  — hit, return + lazy SSOT hydration.
 *      3. SSOT (async)                — hydrates cache + mirror; first call
 *                                       returns `fallback`.
 *  • Write path: cache + mirror + async SSOT write (atomic-ish).
 *  • First localStorage-hit triggers a one-shot SSOT migration if the SSOT
 *    has no value yet — so legacy keys round-trip cleanly.
 */
import { getSetting, putSetting } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

const _cache = new Map<string, unknown>();
const _hydrated = new Set<string>();

function hydrateFromSSOT<T>(key: string, current: T | undefined): void {
  if (_hydrated.has(key)) return;
  _hydrated.add(key);
  void getSetting<T>(key)
    .then((stored) => {
      if (stored !== undefined && stored !== null) {
        _cache.set(key, stored);
        try { localStorage.setItem(key, JSON.stringify(stored)); }
        catch { /* privacy mode — ignore */ }
      } else if (current !== undefined) {
        // SSOT empty, localStorage had a value → migrate up.
        void putSetting(key, current);
      }
    })
    .catch((err: unknown) => {
      logger.debug("[settings-cache] SSOT hydration failed", { key, err });
    });
}

export function readCached<T>(key: string, fallback: T): T {
  const cached = _cache.get(key);
  if (cached !== undefined) return cached as T;

  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as T;
      _cache.set(key, parsed);
      hydrateFromSSOT<T>(key, parsed);
      return parsed;
    }
  } catch { /* malformed / privacy mode — fall through */ }

  hydrateFromSSOT<T>(key, undefined);
  return fallback;
}

export function writeCached<T>(key: string, value: T): void {
  _cache.set(key, value);
  _hydrated.add(key); // no need to re-hydrate after we've written.
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* ignore */ }
  void putSetting(key, value).catch((err: unknown) => {
    logger.debug("[settings-cache] SSOT write failed", { key, err });
  });
}

/** Test seam: wipe RAM cache between cases. */
export function __resetSettingsCache(): void {
  _cache.clear();
  _hydrated.clear();
}
