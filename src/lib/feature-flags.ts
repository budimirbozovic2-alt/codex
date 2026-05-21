// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Lightweight feature-flag registry.
//
// Flags are read SYNCHRONOUSLY at every selector call. Flips persist via
// `localStorage`; default value is environment-aware (DEV defaults to ON for
// the migration flags so internal builds dogfood the new path). Production
// builds default OFF until the 7-day dual-read stability window passes.
//
// Hooks (`useFeatureFlag`) are intentionally NOT provided — flags are stable
// for the lifetime of the session (a flip requires a reload). This keeps the
// React Rules of Hooks intact when a flag controls which underlying hook a
// façade returns.
// ─────────────────────────────────────────────────────────────────────────────

export type FeatureFlagKey = "USE_DB_LIVE_SELECTORS";

interface FlagDefinition {
  /** Default when no localStorage override exists. Resolved per environment. */
  defaultValue: () => boolean;
  /** Stable per session — flips require reload. */
  description: string;
}

const REGISTRY: Record<FeatureFlagKey, FlagDefinition> = {
  USE_DB_LIVE_SELECTORS: {
    // DEV dogfoods the Dexie path; prod stays on the RAM path until validated.
    defaultValue: () => Boolean(import.meta.env?.DEV),
    description:
      "Route card selectors through Dexie liveQuery instead of cardMapStore.",
  },
};

const STORAGE_PREFIX = "ff:";

function readOverride(key: FeatureFlagKey): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

// Snapshot the value once per session so a single render pass always sees a
// stable result (Rules of Hooks safety for flag-routed facades).
const SESSION_SNAPSHOT = new Map<FeatureFlagKey, boolean>();

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const cached = SESSION_SNAPSHOT.get(key);
  if (cached !== undefined) return cached;
  const override = readOverride(key);
  const resolved = override ?? REGISTRY[key].defaultValue();
  SESSION_SNAPSHOT.set(key, resolved);
  return resolved;
}

/**
 * Set an override (persists; takes effect on next reload). Returns the value
 * that will be read after reload — the current session keeps its snapshot.
 */
export function setFeatureOverride(
  key: FeatureFlagKey,
  value: boolean | null,
): boolean {
  try {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + key);
    else localStorage.setItem(STORAGE_PREFIX + key, value ? "1" : "0");
  } catch {
    /* noop — ignore quota / private-mode errors */
  }
  return value ?? REGISTRY[key].defaultValue();
}

/** Test helper: clear the session snapshot so re-reads pick up new overrides. */
export function __resetFeatureFlagsForTests(): void {
  SESSION_SNAPSHOT.clear();
}
