/**
 * OPFS SQLite adapter — PR-8 M1.
 *
 * Implements `PersistAdapter` against the SQLite/OPFS executor. The adapter
 * is **dormant by default**: the factory only selects it once the IDB→SQLite
 * one-shot migration (PR-8 M2) has completed and the Electron runtime check
 * passes. Today it ships behind the factory so it can be unit-tested in
 * isolation without changing any production write paths.
 *
 * Contract preserved from `PersistAdapter`:
 *   • `bulkApply` runs puts + deletes in a single SQL transaction.
 *     SQLite WAL guarantees atomicity and crash-safety on its own — no
 *     application-level outbox row is needed.
 *   • `enqueueWal` is a NO-OP. SQLite already journals every transaction;
 *     duplicating it in the application layer would just double-write.
 *   • `recoverPending` is a NO-OP. The WAL replays on open; if we're being
 *     called we're already past that point.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter, WalOp } from "./PersistAdapter";
import type { SqlExecutor } from "./sqlite/executor";
import { bindCardInsert, CARD_INSERT_SQL } from "./sqlite/row-codecs";
import { getOpfsSqliteExecutor } from "./sqlite/client";
import { logger } from "@/lib/logger";

const CARD_DELETE_SQL = "DELETE FROM cards WHERE id = ?";

export interface OpfsSqliteAdapterDeps {
  /** Override for tests; production uses the lazy OPFS singleton. */
  getExecutor?: () => Promise<SqlExecutor>;
}

export function createOpfsSqliteAdapter(deps: OpfsSqliteAdapterDeps = {}): PersistAdapter {
  const getExec = deps.getExecutor ?? getOpfsSqliteExecutor;

  async function bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
    if (puts.length === 0 && deletes.length === 0) return;
    const exec = await getExec();
    await exec.transaction(async (tx) => {
      for (const card of puts) {
        await tx.run(CARD_INSERT_SQL, bindCardInsert(card));
      }
      for (const id of deletes) {
        await tx.run(CARD_DELETE_SQL, [id]);
      }
    });
  }

  // SQLite owns durability — these are intentional no-ops. Keeping the
  // methods on the interface lets `MirroringAdapter` and the queue stay
  // backend-agnostic.
  async function enqueueWal(_op: WalOp): Promise<void> { /* SQLite WAL handles it */ }
  async function recoverPending(): Promise<{ recovered: number }> {
    // Soft-touch: open the DB so a checkpoint runs even when the queue is
    // idle. Failures are swallowed — boot must never block on this.
    try { await getExec(); } catch (e) { logger.warn("[opfsSqliteAdapter] recover open failed", e); }
    return { recovered: 0 };
  }

  return { bulkApply, enqueueWal, recoverPending };
}

export const opfsSqliteAdapter: PersistAdapter = createOpfsSqliteAdapter();
