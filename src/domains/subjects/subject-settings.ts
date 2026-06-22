import { logger } from "@/lib/logger";
import { loadAppSettings } from "@/lib/app-settings";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import {
  listSettingsByPrefix,
  putSetting,
  deleteSetting,
} from "@/lib/db/queries";
/**
 * Per-subject algorithm overrides.
 *
 * F4: SQLite `kv` is the SSOT. localStorage is kept only as a synchronous fast-read
 * cache, hydrated at boot from SQLite so that restore-from-backup correctly
 * surfaces overrides without requiring a manual reload (previously a Full
 * Restore wiped SQLite but left stale localStorage, or — worse — restored rows
 * that `loadSubjectSettings()` never observed because it read only localStorage).
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
  /** Per-subject FSRS profile preset. */
  knowledgeProfile?: KnowledgeProfile;
}

export type KnowledgeProfile = "memory" | "conceptual";

export const KNOWLEDGE_PROFILE_PRESETS: Record<
  KnowledgeProfile,
  Pick<SubjectSettings, "targetRetention" | "leechThreshold">
> = {
  memory: { targetRetention: 0.93, leechThreshold: 4 },
  conceptual: { targetRetention: 0.88, leechThreshold: 5 },
};

export const KNOWLEDGE_PROFILE_LABELS: Record<KnowledgeProfile, string> = {
  memory: "Memorijski",
  conceptual: "Konceptualni",
};

export const KNOWLEDGE_PROFILE_HINTS: Record<KnowledgeProfile, string> = {
  memory: "Više ponavljanja, kraći intervali — fakti, definicije, liste.",
  conceptual: "Duži intervali, fokus na razumijevanje i eseje.",
};

// In-memory cache: categoryId → settings. Populated at boot from SQLite `kv`.
const _cache: Map<string, SubjectSettings> = new Map();
let _initialized = false;

/**
 * Hydrate the subject-settings cache from SQLite. Called once at boot from
 * useCardBootstrap (after DB open succeeds). Subsequent calls are no-ops.
 *
 * Reads BOTH the SQLite `kv` table and any pre-existing localStorage entries
 * so legacy data is preserved on first run.
 */
export async function initSubjectSettingsCache(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  try {
    const rows = await listSettingsByPrefix<SubjectSettings>(PREFIX);
    for (const row of rows) {
      const id = row.key.slice(PREFIX.length);
      _cache.set(id, row.value);
    }
    // Legacy: hydrate from localStorage for keys not yet in the repo, then
    // mirror them back so the next boot is repo-only.
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
          putSetting(k, parsed).catch((err) =>
            logger.warn("[subject-settings] legacy mirror put failed", err),
          );
        } catch { /* skip malformed entry */ }
      }
    }
  } catch (err) {
    logger.warn("[subject-settings] repo hydrate failed; falling back to localStorage", err);
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

export async function saveSubjectSettings(
  categoryId: string,
  settings: SubjectSettings,
): Promise<void> {
  const prevCached = _cache.get(categoryId);
  const prevLs = typeof localStorage !== "undefined"
    ? localStorage.getItem(PREFIX + categoryId)
    : null;
  _cache.set(categoryId, settings);
  const json = JSON.stringify(settings);
  try { localStorage.setItem(PREFIX + categoryId, json); } catch { /* quota */ }
  try {
    await putSetting(PREFIX + categoryId, settings);
  } catch (err) {
    if (prevCached !== undefined) _cache.set(categoryId, prevCached);
    else _cache.delete(categoryId);
    try {
      if (prevLs === null) localStorage.removeItem(PREFIX + categoryId);
      else localStorage.setItem(PREFIX + categoryId, prevLs);
    } catch { /* noop */ }
    logger.error("[subject-settings] put failed — SSOT write lost", err);
    throw err;
  }
}

export async function clearSubjectSettings(categoryId: string): Promise<void> {
  const prevCached = _cache.get(categoryId);
  const prevLs = typeof localStorage !== "undefined"
    ? localStorage.getItem(PREFIX + categoryId)
    : null;
  _cache.delete(categoryId);
  try { localStorage.removeItem(PREFIX + categoryId); } catch { /* noop */ }
  try {
    await deleteSetting(PREFIX + categoryId);
  } catch (err) {
    if (prevCached !== undefined) _cache.set(categoryId, prevCached);
    try {
      if (prevLs !== null) localStorage.setItem(PREFIX + categoryId, prevLs);
    } catch { /* noop */ }
    logger.error("[subject-settings] delete failed — SSOT row may leak", err);
    throw err;
  }
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
  "knowledgeProfile",
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

export interface EffectiveSrParams {
  targetRetention: number;
  srSettings: SRSettings;
}

/** Global app/SR settings merged with per-subject overrides (sync hot-path). */
export function resolveEffectiveSrParams(
  categoryId: string,
  globalSrSettings: SRSettings = DEFAULT_SR_SETTINGS,
): EffectiveSrParams {
  const overrides = loadSubjectSettings(categoryId);
  const targetRetention = mergeSubjectOverrides(
    { targetRetention: loadAppSettings().targetRetention },
    overrides,
  ).targetRetention;
  const srSettings = mergeSubjectOverrides(globalSrSettings, overrides);
  return { targetRetention, srSettings };
}

