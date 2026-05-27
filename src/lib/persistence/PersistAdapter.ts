/**
 * PersistAdapter — PR-9 M4 (post A1a).
 *
 * Storage-agnostic write surface used by the card persist queue. Now reduced
 * to a single `bulkApply` op:
 *   • SQLite is the SSOT and owns durability via WAL — no app-level WAL needed.
 *   • The IDB mirror is best-effort rollback insurance, not a recovery store.
 *
 * The pre-PR-9 `enqueueWal` / `recoverPending` methods were dropped together
 * with the `outbox` Dexie table — SQLite WAL replaces both verbatim.
 */
import type { Card } from "@/lib/spaced-repetition";

export interface PersistAdapter {
  /**
   * Apply a batch of puts and deletes atomically (single SQL transaction in
   * SQLite, single Dexie `rw` tx in the IDB mirror).
   */
  bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void>;
}
