/**
 * Per-subject algorithm overrides.
 *
 * F4: IDB is the SSOT. localStorage is kept only as a synchronous fast-read
 * cache, hydrated at boot from IDB so that restore-from-backup correctly
 * surfaces overrides without requiring a manual reload (previously a Full
 * Restore wiped IDB but left stale localStorage, or — worse — restored IDB
 * rows that `loadSubjectSettings()` never observed because it read only
 * localStorage).
 */

const PREFIX = "sr-subject-settings-";

export interface SubjectSettings {
  /** Override target retention (0.85–0.99) */
  targetRetention?: number;
  /** Override leech threshold */
  leechThreshold?: number;
  /** Override daily review goal */
  dailyGoal?: number;
  /** Override resistance weights */
  resistanceWeights?: { lapses: number; latency: number; forgetting: number };
}

// In-memory cache: categoryId → settings. Populated at boot from IDB.
const _cache: Map<string, SubjectSettings> = new Map();
let _initialized = false;

/**
 * Hydrate the subject-settings cache from IDB. Called once at boot from
 * useCardBootstrap (after ensureDbOpen succeeds). Subsequent calls are no-ops.
 *
 * Reads BOTH the IDB `settings` table and any pre-existing localStorage entries
 * so legacy data is preserved on first run.
 */
export async function initSubjectSettingsCache(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  try {
    const { db } = await import("./db");
    const rows = await db.settings.where("key").startsWith(PREFIX).toArray();
    for (const row of rows) {
      const id = row.key.slice(PREFIX.length);
      _cache.set(id, row.value as SubjectSettings);
    }
    // Legacy: hydrate from localStorage for keys not yet in IDB, then mirror
    // them back to IDB so the next boot is IDB-only.
    if (typeof localStorage !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        const id = k.slice(PREFIX.length);
        if (_cache.has(id)) continue;
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as SubjectSettings;
          _cache.set(id, parsed);
          db.settings.put({ key: k, value: parsed }).catch(() => {});
        } catch { /* skip malformed entry */ }
      }
    }
  } catch (err) {
    console.warn("[subject-settings] IDB hydrate failed; falling back to localStorage", err);
  }
}

export function loadSubjectSettings(categoryId: string): SubjectSettings | null {
  const cached = _cache.get(categoryId);
  if (cached !== undefined) return cached;
  // Fallback path before cache is initialized (rare — bootstrap should run first).
  try {
    const raw = localStorage.getItem(PREFIX + categoryId);
    if (!raw) return null;
    return JSON.parse(raw) as SubjectSettings;
  } catch {
    return null;
  }
}

export function saveSubjectSettings(categoryId: string, settings: SubjectSettings): void {
  _cache.set(categoryId, settings);
  const json = JSON.stringify(settings);
  // localStorage stays as a fast-read mirror.
  try { localStorage.setItem(PREFIX + categoryId, json); } catch { /* quota */ }
  // IDB is canonical and is the source for backups + restore.
  import("./db").then(({ db }) => {
    db.settings.put({ key: PREFIX + categoryId, value: settings })
      .catch((err) => console.warn("[subject-settings] IDB put failed", err));
  }).catch(() => {});
}

export function clearSubjectSettings(categoryId: string): void {
  _cache.delete(categoryId);
  try { localStorage.removeItem(PREFIX + categoryId); } catch { /* noop */ }
  import("./db").then(({ db }) => {
    db.settings.delete(PREFIX + categoryId)
      .catch((err) => console.warn("[subject-settings] IDB delete failed", err));
  }).catch(() => {});
}

/** Returns true if any overrides are saved for this subject */
export function hasSubjectOverrides(categoryId: string): boolean {
  return loadSubjectSettings(categoryId) !== null;
}

/**
 * Phase C / P2-3: tipizirani merge globalnih podešavanja s per-subject
 * overrides. Eliminiše inline `!== undefined` spread-conditionals u UI.
 *
 * Polja u `overrides` koja su `undefined` se ignorišu (base se zadržava).
 */
export const OVERRIDABLE_SUBJECT_KEYS = [
  "targetRetention",
  "leechThreshold",
  "dailyGoal",
  "resistanceWeights",
] as const satisfies readonly (keyof SubjectSettings)[];

export function mergeSubjectOverrides<T extends Partial<SubjectSettings>>(
  base: T,
  overrides: SubjectSettings | null | undefined,
): T {
  if (!overrides) return base;
  const merged: T = { ...base };
  for (const key of OVERRIDABLE_SUBJECT_KEYS) {
    const value = overrides[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

