/**
 * A1c Phase 4 — flag-gated boot path.
 *
 * Cheap SELECT against the SQLite `kv` table to determine whether the
 * one-shot IDB → SQLite migration already completed on a previous boot.
 *
 * Used by `bootDb` / `runSchema` to skip loading the Dexie legacy shell
 * entirely on the common (post-migration) boot path. Keeps the lazy
 * `legacy/idb-dexie` chunk out of memory and out of the network for every
 * post-migration boot.
 */
import type { SqlExecutor } from "./executor";
import { MIGRATION_FLAG_KEY } from "./migrate-from-idb";
import { isElectron } from "@/lib/electron-integration";
import { logger } from "@/lib/logger";

/** Returns `true` iff `migrated-from-idb-v1` is present in the SQLite kv table. */
export async function isSqliteMigrationComplete(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [MIGRATION_FLAG_KEY],
  );
  return rows.length > 0;
}

/**
 * Combined preflight: opens the SQLite executor (Electron only) and returns
 * `true` if the migration flag is set. On non-Electron / failure returns
 * `false` so the caller falls back to the legacy Dexie path.
 */
export async function isLegacyDexieBypassed(): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const { getOpfsSqliteExecutor } = await import("./client");
    const exec = await getOpfsSqliteExecutor();
    return await isSqliteMigrationComplete(exec);
  } catch (e) {
    logger.warn("[boot] sqlite preflight failed — falling back to Dexie", e);
    return false;
  }
}

/**
 * Telemetry: if the migration flag is set yet the legacy `MemoriaDB` IDB
 * still exists, log a warning so the health monitor can surface it.
 * Non-throwing; uses the standard `indexedDB.databases()` enumeration so it
 * does NOT load Dexie or open a connection.
 */
export async function assertNoLegacyIdb(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
    const dbs = await indexedDB.databases();
    if (dbs.some((d) => d.name === "MemoriaDB")) {
      logger.warn("[boot] legacy-idb-residual: MemoriaDB IDB still present after SQLite migration");
    }
  } catch {
    /* enumeration unsupported / blocked — silent */
  }
}
