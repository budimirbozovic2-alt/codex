// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A → 5C — Category Repository facade.
//
// Phase 5A introduced this file as a write-contract emitter (just
// `emitCategoriesUpdated`). Phase 5C promotes it into the **primary writer**
// for `categoryRecords`, mirroring `cardRepository`:
//
//   - `commit(updater, label)` runs the optimistic mirror write + serialised
//     IDB persist + rollback dance previously living in `category-service`.
//   - `replaceAll(records)` is the bootstrap / restore atom.
//   - `getCategorySnapshot()` is the sync read primitive.
//
// React `CategoryStateProvider` no longer holds the SSOT — it subscribes to
// the external mirror via `useSyncExternalStore`. Action providers keep
// their existing `setCategoryRecords` prop but the shim writes into the
// repository, so legacy call sites compile unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import { idbLoadCategories, idbSaveCategories, type CategoryRecord } from "@/lib/db";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";

export type CategoriesUpdatedSource =
  | "repository"
  | "repository-replace"
  | string; // external — backup-restore, cascade-delete, normalize, …

export interface CategoriesUpdatedPayload {
  source: CategoriesUpdatedSource;
  categoryIds?: string[];
  deletedIds?: string[];
}

export function emitCategoriesUpdated(payload: CategoriesUpdatedPayload): void {
  try { eventBus.emit(EVENT_TYPES.CATEGORIES_UPDATED, payload); }
  catch { /* bus failures must not break a commit */ }
}

// ─── Read primitives ─────────────────────────────────────────────────────
export function getCategorySnapshot(): CategoryRecord[] {
  return getCategoryStoreRecords();
}

// ─── Write primitives ────────────────────────────────────────────────────

/**
 * Full replace — bootstrap, restore, invalidator. Pushes into the mirror
 * synchronously and tags the event so external subscribers can react.
 * Does NOT persist to IDB on its own (the upstream caller — e.g.
 * `applyImportAtomically`, `loadInitialData` — has already done that).
 */
export function replaceAll(records: CategoryRecord[]): void {
  setCategoryStoreRecords(records);
  emitCategoriesUpdated({
    source: "repository-replace",
    categoryIds: records.map(r => r.id),
  });
}

// Mutex for serialising IDB writes — prevents concurrent overwrites when
// two optimistic updates race (e.g. fast double-click on reorder).
let _pendingSave: Promise<void> = Promise.resolve();

/**
 * Optimistic commit: mutates the mirror inline, then persists to IDB inside
 * a serialised mutex. On persist failure, rolls back from fresh IDB state
 * (preferred) or the pre-commit snapshot.
 */
export async function commit(
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string,
): Promise<void> {
  const snapshot = getCategoryStoreRecords();
  const optimistic = updater(snapshot);
  setCategoryStoreRecords(optimistic);

  const op = _pendingSave.then(async () => {
    try {
      // Re-read fresh IDB inside the mutex, then re-apply the updater to
      // avoid stale-closure overwrites (matches the legacy contract).
      const fresh = await idbLoadCategories();
      const next = updater(fresh);
      await idbSaveCategories(next);
      // Keep the mirror in sync with the canonical persisted state.
      setCategoryStoreRecords(next);
      emitCategoriesUpdated({
        source: "repository",
        categoryIds: next.map(c => c.id),
      });
    } catch (e) {
      logger.error(`[${label}] IDB persist failed, rolling back`, e);
      try {
        const fromIdb = await idbLoadCategories();
        setCategoryStoreRecords(fromIdb);
      } catch {
        setCategoryStoreRecords(snapshot);
      }
      toast.error("Greška", { description: "Promjena nije sačuvana." });
    }
  });
  _pendingSave = op.catch(() => {});
  return op;
}

export const categoryRepository = {
  // reads
  snapshot: getCategorySnapshot,
  // writes
  commit,
  replaceAll,
  // events
  emit: emitCategoriesUpdated,
};
