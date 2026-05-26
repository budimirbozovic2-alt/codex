// ─────────────────────────────────────────────────────────────────────────────
// Lightweight feature-flag registry.
//
// Flags are read SYNCHRONOUSLY and snapshot-stable per session (flips require
// reload). After PR-7e the only flag that lived here — `USE_DB_LIVE_SELECTORS`
// — was retired together with the Dexie selector fan-out, so the registry is
// currently empty. The plumbing stays so future flips have a typed home.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FeatureFlagKey = never;

interface FlagDefinition {
  defaultValue: () => boolean;
  description: string;
}

const REGISTRY: Record<string, FlagDefinition> = {};

const STORAGE_PREFIX = "ff:";

function readOverride(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

const SESSION_SNAPSHOT = new Map<string, boolean>();

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const k = key as unknown as string;
  const cached = SESSION_SNAPSHOT.get(k);
  if (cached !== undefined) return cached;
  const def = REGISTRY[k];
  if (!def) return false;
  const override = readOverride(k);
  const resolved = override ?? def.defaultValue();
  SESSION_SNAPSHOT.set(k, resolved);
  return resolved;
}

export function setFeatureOverride(
  key: FeatureFlagKey,
  value: boolean | null,
): boolean {
  const k = key as unknown as string;
  try {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + k);
    else localStorage.setItem(STORAGE_PREFIX + k, value ? "1" : "0");
  } catch {
    /* noop */
  }
  return value ?? REGISTRY[k]?.defaultValue() ?? false;
}

export function __resetFeatureFlagsForTests(): void {
  SESSION_SNAPSHOT.clear();
}
