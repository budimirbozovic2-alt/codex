/**
 * OPFS SQLite adapter — PR-9 M4.
 *
 * Implements `PersistAdapter` against the SQLite/OPFS executor. SQLite WAL
 * owns durability; the historical `enqueueWal` / `recoverPending` methods
 * were removed in A1a together with the outbox.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter } from "./PersistAdapter";
import type { SqlExecutor } from "./sqlite/executor";
import { bindCardInsert, CARD_INSERT_SQL } from "./sqlite/row-codecs";
import { getOpfsSqliteExecutor } from "./sqlite/client";

const CARD_DELETE_SQL = "DELETE FROM cards WHERE id = ?";

export interface OpfsSqliteAdapterDeps {
  /** Override for tests; production uses the lazy OPFS singleton. */
  getExecutor?: () => Promise<SqlExecutor>;
}

export function createOpfsSqliteAdapter(deps: OpfsSqliteAdapterDeps = {}): PersistAdapter {
  const getExec = deps.getExecutor ?? getOpfsSqliteExecutor;

  async function bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
    if (puts.length === 0 && deletes.length === 0) return;
    let exec;
    try {
      exec = await getExec();
    } catch (cause) {
      // Wave-3 fix: preserve original cause instead of swallowing it. Without
      // this, WASM load failures, OPFS denials and quota errors all collapse
      // into an indistinguishable "NO_EXECUTOR" string with no telemetry.
      logger.error("[opfs-adapter] executor unavailable", cause);
      const err = new Error("NO_EXECUTOR") as Error & { cause?: unknown };
      err.cause = cause;
      throw err;
    }
    await exec.transaction(async (tx) => {
      for (const card of puts) {
        await tx.run(CARD_INSERT_SQL, bindCardInsert(card));
      }
      for (const id of deletes) {
        await tx.run(CARD_DELETE_SQL, [id]);
      }
    });
  }

  return { bulkApply };
}

export const opfsSqliteAdapter: PersistAdapter = createOpfsSqliteAdapter();
