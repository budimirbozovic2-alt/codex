/**
 * MirroringAdapter — PR-9 M4.
 *
 * Wraps two `PersistAdapter`s so every write fans out to both. The primary
 * is awaited (its result decides success/failure); the secondary is
 * fire-and-forget so a slow legacy backend can't slow down the hot path.
 *
 * Used to mirror SQLite (primary) ↔ IDB (legacy mirror) for one release as
 * rollback insurance. PR-9 will retire the mirror once Dexie readers are
 * fully cut over to SQLite-backed queries.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter } from "./PersistAdapter";
import { logger } from "@/lib/logger";

export function createMirroringAdapter(
  primary: PersistAdapter,
  secondary: PersistAdapter,
): PersistAdapter {
  return {
    async bulkApply(puts: readonly Card[], deletes: readonly string[]): Promise<void> {
      // Kick off the secondary first so it overlaps with the primary's
      // disk wait. We don't await it — failures are logged.
      void secondary
        .bulkApply(puts, deletes)
        .catch((err) => logger.warn("[mirroringAdapter] secondary bulkApply failed", err));
      await primary.bulkApply(puts, deletes);
    },
  };
}
