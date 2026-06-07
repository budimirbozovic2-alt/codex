/**
 * Settings repository — PR-9 A1c-2. SQLite-only KV read/write.
 */
import type { 
  SqlExecutor 
} from "@/lib/persistence/sqlite/executor";
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { logger } from "@/lib/logger";
import { 
  notifyExecutorNull 
} from "./_shared/executor-telemetry";

// ─── Executor accessor ──────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import(
      "@/lib/electron-integration"
    );
    if (!isElectron() && import.meta.env.PROD) { 
      notifyExecutorNull("settings", "non-electron"); 
      return null; 
    }
    
    const { getOpfsSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );
    
    // PR-H7 ŠTIT: Čekamo bazu do 3 sekunde ako se modul tek budi
    let exec = await getOpfsSqliteExecutor();
    let retries = 30;
    
    while (!exec && retries > 0) {
      await new Promise((res) => setTimeout(res, 100));
      exec = await getOpfsSqliteExecutor();
      retries--;
    }
    
    return exec;
  } catch (err) {
    logger.warn(
      "[settings-repo] sqlite executor unavailable", 
      err
    );
    notifyExecutorNull("settings", "error");
    return null;
  }
}

async function requireExecutor(
  label: string
): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import(
    "@/lib/electron-integration"
  );
  assertDesktop();
  logger.warn(
    `[settings-repo] ${label} — no executor (dev shell)`
  );
  return null;
}

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
  const exec = await requireExecutor("getSetting");
  if (!exec) return undefined;
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
  const exec = await requireExecutor("listSettingsByPrefix");
  if (!exec) return [];
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
  const exec = await requireExecutor("putSetting");
  if (!exec) return;
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
  const exec = await requireExecutor("deleteSetting");
  if (!exec) return;
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