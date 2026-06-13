/**
 * Settings repository — PR-9 A1c-2. 
 * SQLite-only KV read/write.
 */
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { logger } from "@/lib/logger";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

// ─── Change emitter (prefix-aware) ─────────────────────────────

type SettingsListener = (key: string) => void;
const _settingsListeners = new Set<{ 
  prefix: string; 
  fn: SettingsListener 
}>();

export function onSettingsChanged(
  prefix: string, 
  fn: SettingsListener
): () => void {
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

// ─── Read API ───────────────────────────────────────────────────

export async function getSetting<T>(
  key: string
): Promise<T | undefined> {
  const exec = await requireSqlExecutor("settings:getSetting");
  try { 
    return await kvGet<T>(exec, key); 
  } catch (err) {
    logger.warn(
      "[settings-repo] sqlite get failed", 
      { key, err }
    );
    return undefined;
  }
}

export async function listSettingsByPrefix<T = unknown>(
  prefix: string,
): Promise<Array<{ key: string; value: T }>> {
  const exec = await requireSqlExecutor("settings:listSettingsByPrefix");
  try {
    const rows = await exec.all<{ key: string; value: string }>(
      "SELECT key, value FROM kv WHERE key LIKE ?", 
      [`${prefix}%`],
    );
    return rows.map((r) => {
      try { 
        return { 
          key: r.key, 
          value: JSON.parse(r.value) as T 
        }; 
      } catch { 
        return { 
          key: r.key, 
          value: null as unknown as T 
        }; 
      }
    });
  } catch (err) {
    logger.warn(
      "[settings-repo] sqlite listByPrefix failed", 
      { prefix, err }
    );
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────

export async function putSetting<T>(
  key: string, 
  value: T
): Promise<void> {
  const exec = await requireSqlExecutor("settings:putSetting");
  try { 
    await kvPut<T>(exec, key, value); 
  } catch (err) { 
    logger.warn(
      "[settings-repo] sqlite put failed", 
      { key, err }
    ); 
  }
  _notify(key);
}

export async function deleteSetting(key: string): Promise<void> {
  const exec = await requireSqlExecutor("settings:deleteSetting");
  try { 
    await exec.run("DELETE FROM kv WHERE key = ?", [key]); 
  } catch (err) { 
    logger.warn(
      "[settings-repo] sqlite delete failed", 
      { key, err }
    ); 
  }
  _notify(key);
}
