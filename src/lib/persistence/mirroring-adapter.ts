/**
 * MirroringAdapter — PR-8 M3 rollback insurance.
 *
 * Wraps two `PersistAdapter`s so every write fans out to both. The primary
 * is awaited (its result decides success/failure); the secondary is
 * fire-and-forget so a slow legacy backend can't slow down the hot path.
 *
 * Intended use: ship the SQLite adapter as primary with `idbOutboxAdapter`
 * as secondary for one release. If a critical bug surfaces we flip the
 * factory back to IDB-primary and the data is already there.
 *
 * `recoverPending` only consults the primary — recovery is the primary's
 * responsibility and double-recovery would be incorrect.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter, WalOp } from "./PersistAdapter";
import { logger } from "@/lib/logger";

export function createMirroringAdapter(
  primary: PersistAdapter,
  secondary: PersistAdapter,
): PersistAdapter {
  return {
    async bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
      // Kick off the secondary first so it overlaps with the primary's
      // network/disk wait. We don't await it — failures are logged.
      void secondary
        .bulkApply(puts, deletes)
        .catch((err) => logger.warn("[mirroringAdapter] secondary bulkApply failed", err));
      await primary.bulkApply(puts, deletes);
    },
    async enqueueWal(op: WalOp): Promise<void> {
      void secondary.enqueueWal(op).catch(() => { /* WAL writes are best-effort */ });
      await primary.enqueueWal(op);
    },
    async recoverPending(): Promise<{ recovered: number }> {
      return primary.recoverPending();
    },
  };
}
