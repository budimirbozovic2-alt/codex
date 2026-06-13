/**
 * SQLite boot flags — legacy IDB migration path removed after cut-over.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";

export const MIGRATION_FLAG_KEY = "migrated-from-idb-v1";
const PR9_READPATH_FLAG_KEY = "migrated-readpath-pr9-v1";

export async function isSqliteMigrationComplete(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [MIGRATION_FLAG_KEY],
  );
  return rows.length > 0;
}

/** Stamp boot flags on fresh SQLite installs (no legacy MemoriaDB import). */
export async function ensureSqliteBootstrapped(exec: SqlExecutor): Promise<void> {
  if (!(await isSqliteMigrationComplete(exec))) {
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [MIGRATION_FLAG_KEY, JSON.stringify({ at: Date.now(), bootstrap: true })],
    );
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
      }
    } catch {
      /* private mode */
    }
    logger.info("[boot] sqlite bootstrap flag set");
  }

  const pr9 = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [PR9_READPATH_FLAG_KEY],
  );
  if (pr9.length === 0) {
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [PR9_READPATH_FLAG_KEY, JSON.stringify({ at: Date.now() })],
    );
  }
}
