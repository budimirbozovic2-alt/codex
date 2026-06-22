/**
 * TanStack authoritative cache for SQLite-backed UI prefs (dark mode, TTS, filters).
 * Replaces `settings-cache` localStorage mirror — boot hydrates from SQLite;
 * sync reads/writes go through queryClient + async putSetting.
 */
import { getSetting, putSetting } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { queryClient } from "./client";
import { queryKeys } from "./keys";

const _hydrated = new Set<string>();

export function resetPrefsQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.prefs.root });
  _hydrated.clear();
}

export function getPrefFromCache<T>(key: string, fallback: T): T {
  const cached = queryClient.getQueryData<T>(queryKeys.prefs.byKey(key));
  return cached !== undefined ? cached : fallback;
}

export function seedPref<T>(key: string, value: T): void {
  queryClient.setQueryData(queryKeys.prefs.byKey(key), value);
  _hydrated.add(key);
}

export function writePref<T>(key: string, value: T): void {
  seedPref(key, value);
  void putSetting(key, value).catch((err: unknown) => {
    logger.debug("[prefs-cache] SSOT write failed", { key, err });
  });
}

function hydratePrefFromDb<T>(key: string): void {
  if (_hydrated.has(key)) return;
  _hydrated.add(key);
  void getSetting<T>(key)
    .then((stored) => {
      if (stored !== undefined && stored !== null) {
        seedPref(key, stored);
      }
    })
    .catch((err: unknown) => {
      logger.debug("[prefs-cache] SSOT hydration failed", { key, err });
    });
}

/** Sync read — returns TanStack seed or fallback; kicks off lazy SQLite hydrate. */
export function readPref<T>(key: string, fallback: T): T {
  const cached = queryClient.getQueryData<T>(queryKeys.prefs.byKey(key));
  if (cached !== undefined) return cached;
  hydratePrefFromDb<T>(key);
  return fallback;
}

/** Boot — preload common prefs into TanStack. */
export async function initPrefsQueryCache(): Promise<void> {
  const keys = ["darkMode", "sr-tts-settings"] as const;
  await Promise.all(
    keys.map(async (key) => {
      try {
        const stored = await getSetting<unknown>(key);
        if (stored !== undefined && stored !== null) {
          seedPref(key, stored);
        } else {
          _hydrated.add(key);
        }
      } catch (err) {
        logger.debug("[prefs-cache] boot hydrate failed", { key, err });
      }
    }),
  );
}
