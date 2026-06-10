/**
 * OPFS SQLite client — tanak delegate na centralni readyMachine (O-1).
 *
 * Sav retry / dev-fallback / degraded-emit logika živi u
 * `./readyMachine.ts`. Ovaj modul postoji da očuva postojeću
 * `getOpfsSqliteExecutor()` API površinu koju koristi 20+ pozivnih
 * mjesta — migracija na `ensureSqliteReady()` / `getExecutorOrThrow()`
 * je odvojen cleanup korak van skopa O-1.
 */
import type { SqlExecutor } from "./executor";
import {
  ensureSqliteReady,
  __resetSqliteReadyMachine,
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
export function __resetSqliteClient(): void {
  __resetSqliteReadyMachine();
}
