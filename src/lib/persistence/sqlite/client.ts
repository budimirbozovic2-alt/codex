/**
 * OPFS SQLite client — Worker-backed (PR-H-OPFS-FIX-4).
 * Spawns an opfs-worker.ts that owns the DB connection.
 */
import type { SqlExecutor } from "./executor";
import {
  ensureSqliteReady,
  __resetSqliteReadyForTests,
} from "./readyMachine";

export function getOpfsSqliteExecutor(): Promise<SqlExecutor> {
  return ensureSqliteReady();
}

/**
 * PR-H2: Safe ACID Transaction orchestrator.
 * B-1 FIX: Transakcija se nativno delegira Workeru.
 */
export async function runInTransaction<T>(
  cb: (executor: SqlExecutor) => Promise<T>
): Promise<T> {
  const executor = await getOpfsSqliteExecutor();
  return executor.transaction(cb);
}

/** Test seam (vitest only). */
export function __resetSqliteClient(): void {
  __resetSqliteReadyForTests();
}
