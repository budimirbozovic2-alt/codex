/**
 * OPFS SQLite client — tanak delegate na centralni readyMachine (O-1).
 *
 * Retry i fail-fast logika živi u `./readyMachine.ts`. Ovaj modul očuva
 * postojeću `getOpfsSqliteExecutor()` API površinu.
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
  cb: (executor: SqlExecutor) => Promise<T>,
): Promise<T> {
  const executor = await ensureSqliteReady();
  return executor.transaction(cb);
}

/** Test seam (vitest only). */
function __resetSqliteClient(): void {
  __resetSqliteReadyForTests();
}
