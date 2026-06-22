/**
 * SQLite client — tanak delegate na centralni readyMachine (O-1).
 *
 * Retry i fail-fast logika živi u `./readyMachine.ts`.
 */
import type { SqlExecutor } from "./executor";
import {
  ensureSqliteReady,
  __resetSqliteReadyForTests,
} from "./readyMachine";

let _overrideExecutor: SqlExecutor | null = null;

/** Run queries against a specific executor (migration / tests). */
export async function runWithSqlExecutor<T>(
  exec: SqlExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = _overrideExecutor;
  _overrideExecutor = exec;
  try {
    return await fn();
  } finally {
    _overrideExecutor = prev;
  }
}

export function getSqliteExecutor(): Promise<SqlExecutor> {
  if (_overrideExecutor) return Promise.resolve(_overrideExecutor);
  return ensureSqliteReady();
}

/** @deprecated Use `getSqliteExecutor` — name kept for incremental migration. */
export const getOpfsSqliteExecutor = getSqliteExecutor;

/**
 * PR-H2: Safe ACID Transaction orchestrator.
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
