/**
 * Settings repository — PR-9 M3.
 *
 * SQLite-primary KV read/write for everything that used to live in the
 * Dexie `settings` table:
 *   • `appSettings`            (global app prefs)
 *   • `subject_settings:<id>`  (per-subject overrides)
 *   • `metacognitive` scalars  (lastAnalysisDate, appEntry…)
 *   • misc bootstrap flags
 *
 * Pattern matches `planner.ts` and `drafts.ts`:
 *   1. Try SQLite (when running in Electron).
 *   2. Mirror write to Dexie for one soak release.
 *   3. Fallback to Dexie-only in Vite dev preview.
 *
 * Listeners are prefix-aware so consumers can subscribe to just their key
 * family (e.g. `onSettingsChanged("subject_settings:")`).
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("settings", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[settings-repo] sqlite executor unavailable, using Dexie fallback", err);
    notifyExecutorNull("settings", "error");
    return null;
  }
}

// ─── Change emitter (prefix-aware) ─────────────────────────────────────

type SettingsListener = (key: string) => void;
const _settingsListeners = new Set<{ prefix: string; fn: SettingsListener }>();

/**
 * Subscribe to changes. If `prefix` is provided, the listener fires only
 * when a mutated key starts with that prefix. Pass "" to receive all.
 */
export function onSettingsChanged(prefix: string, fn: SettingsListener): () => void {
  const entry = { prefix, fn };
  _settingsListeners.add(entry);
  return () => { _settingsListeners.delete(entry); };
}

function _notify(key: string): void {
  for (const { prefix, fn } of _settingsListeners) {
    if (!prefix || key.startsWith(prefix)) {
      try { fn(key); } catch { /* swallow */ }
    }
  }
}

// ─── Read API ───────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { return await kvGet<T>(exec, key); }
    catch (err) { logger.warn("[settings-repo] sqlite get failed", { key, err }); }
  }
  try {
    const row = await db.settings.get(key);
    return row?.value as T | undefined;
  } catch (err) {
    logger.warn("[settings-repo] dexie get failed", { key, err });
    return undefined;
  }
}

export async function listSettingsByPrefix<T = unknown>(
  prefix: string,
): Promise<Array<{ key: string; value: T }>> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ key: string; value: string }>(
        "SELECT key, value FROM kv WHERE key LIKE ?", [`${prefix}%`],
      );
      return rows.map((r) => {
        try { return { key: r.key, value: JSON.parse(r.value) as T }; }
        catch { return { key: r.key, value: null as unknown as T }; }
      });
    } catch (err) {
      logger.warn("[settings-repo] sqlite listByPrefix failed", { prefix, err });
    }
  }
  try {
    const rows = await db.settings.where("key").startsWith(prefix).toArray();
    return rows.map((r) => ({ key: r.key, value: r.value as T }));
  } catch (err) {
    logger.warn("[settings-repo] dexie listByPrefix failed", { prefix, err });
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putSetting<T>(key: string, value: T): Promise<void> {
  const exec = await tryGetExecutor();
  if (!exec) {
    const { assertDesktop } = await import("@/lib/electron-integration");
    assertDesktop();
    return;
  }
  try { await kvPut<T>(exec, key, value); }
  catch (err) { logger.warn("[settings-repo] sqlite put failed", { key, err }); }
  _notify(key);
}

export async function deleteSetting(key: string): Promise<void> {
  const exec = await tryGetExecutor();
  if (!exec) {
    const { assertDesktop } = await import("@/lib/electron-integration");
    assertDesktop();
    return;
  }
  try { await exec.run("DELETE FROM kv WHERE key = ?", [key]); }
  catch (err) { logger.warn("[settings-repo] sqlite delete failed", { key, err }); }
  _notify(key);
}
