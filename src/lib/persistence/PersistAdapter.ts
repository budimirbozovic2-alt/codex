/**
 * PersistAdapter — PR-7d M3.2.
 *
 * Storage-agnostic write surface used by the card persist queue. The current
 * implementation is `idbOutboxAdapter` (Dexie + WAL outbox table). When OPFS
 * SQLite lands (separate PR) we will swap in `opfsSqliteAdapter` here; the
 * persist queue and repositories do not need to change.
 *
 * Intentionally minimal — only the ops actually used by the queue. Anything
 * richer (transactions, range queries) stays in the repository / query layer
 * which already imports IDB directly. This seam exists ONLY to decouple the
 * write/recovery hot path from Dexie.
 */
import type { Card } from "@/lib/spaced-repetition";

export interface PersistAdapter {
  /**
   * Apply a batch of puts and deletes atomically (single transaction in IDB
   * today, single SQL transaction tomorrow). Implementations MUST clear any
   * crash-recovery markers for these ids after the commit.
   */
  bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void>;

  /**
   * Record a single pending operation in the durable WAL so a crash mid-flush
   * can be recovered on the next boot. Best-effort: failures here are logged
   * but never bubbled — the optimistic in-memory commit has already happened.
   */
  enqueueWal(op: WalOp): Promise<void>;

  /**
   * Scan the WAL for unflushed operations left behind by a previous crash and
   * apply them. Returns the number of recovered rows.
   */
  recoverPending(): Promise<{ recovered: number }>;
}

export type WalOp =
  | { kind: "put"; card: Card }
  | { kind: "delete"; id: string };
