/**
 * SQL executor abstraction — PR-8 M1.
 *
 * Narrow contract for main-process better-sqlite3 (Electron) and in-memory
 * test shims without dragging optional runtimes into vitest.
 *
 * Only the surface the adapter actually uses is exposed here. Anything
 * richer (PRAGMAs, attach, etc.) is invoked via `exec` with a raw SQL string.
 */

export type SqlBindValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, SqlBindValue>;

export interface SqlExecutor {
  /** Run a single statement that returns no rows (DDL, INSERT, DELETE…). */
  run(sql: string, params?: readonly SqlBindValue[]): Promise<void>;
  /**
   * Run the same statement once per parameter batch. Implementations may
   * bind once and reuse the prepared statement, avoiding worker-IPC chatter
   * vs. an `await tx.run()` loop. Order is preserved; failure aborts.
   */
  runMany(sql: string, paramsBatches: readonly (readonly SqlBindValue[])[]): Promise<void>;
  /** Run a parameterised SELECT and return all rows. */
  all<T = SqlRow>(sql: string, params?: readonly SqlBindValue[]): Promise<T[]>;
  /** Execute a multi-statement script (semicolon-separated DDL etc.). */
  exec(sql: string): Promise<void>;
  /** Wrap `fn` in a single SQL transaction (BEGIN…COMMIT / ROLLBACK). */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  /** Release native resources (worker, file handles). Idempotent. */
  close(): Promise<void>;
}

