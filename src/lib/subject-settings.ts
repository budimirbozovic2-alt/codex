/**
 * Per-subject algorithm overrides.
 * When present, these values take priority over global settings for the given category.
 * Missing keys fall back to global defaults automatically.
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

export function loadSubjectSettings(categoryId: string): SubjectSettings | null {
  try {
    const raw = localStorage.getItem(PREFIX + categoryId);
    if (!raw) return null;
    return JSON.parse(raw) as SubjectSettings;
  } catch {
    return null;
  }
}

export function saveSubjectSettings(categoryId: string, settings: SubjectSettings): void {
  const json = JSON.stringify(settings);
  try { localStorage.setItem(PREFIX + categoryId, json); } catch {}
  // Mirror to IDB
  import("./db").then(({ db }) => {
    db.settings.put({ key: PREFIX + categoryId, value: settings }).catch(() => {});
  }).catch(() => {});
}

export function clearSubjectSettings(categoryId: string): void {
  try { localStorage.removeItem(PREFIX + categoryId); } catch {}
  import("./db").then(({ db }) => {
    db.settings.delete(PREFIX + categoryId).catch(() => {});
  }).catch(() => {});
}

/** Returns true if any overrides are saved for this subject */
export function hasSubjectOverrides(categoryId: string): boolean {
  return loadSubjectSettings(categoryId) !== null;
}
