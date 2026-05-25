// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for `categoryRecords`.
//
// Post Task-B: the EventBus CATEGORIES_UPDATED fan-out is gone. Every write
// goes through Zustand `categoryStore`, which is the SSOT all readers
// subscribe to via `useSyncExternalStore`. External callers that bypass
// this repository (e.g. backup-restore) push directly into the store via
// `setCategoryStoreRecords`.
// ─────────────────────────────────────────────────────────────────────────────
import { idbLoadCategories, idbSaveCategories, type CategoryRecord } from "@/lib/db";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { createKeyedMutex } from "@/lib/concurrency";
import {
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";

// ─── Read primitives ─────────────────────────────────────────────────────
export function getCategorySnapshot(): CategoryRecord[] {
  return getCategoryStoreRecords();
}

// ─── Write primitives ────────────────────────────────────────────────────

/**
 * Full replace — bootstrap, restore. Pushes into the SSOT synchronously.
 * Does NOT persist to IDB on its own (the upstream caller — e.g.
 * `applyImportAtomically`, `loadInitialData` — has already done that).
 */
export function replaceAll(records: CategoryRecord[]): void {
  setCategoryStoreRecords(records);
}

// Mutex for serialising IDB writes — prevents concurrent overwrites when
// two optimistic updates race (e.g. fast double-click on reorder).
const _saveMutex = createKeyedMutex();

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

  return _saveMutex.runExclusive(null, async () => {
    try {
      // Re-read fresh IDB inside the mutex, then re-apply the updater to
      // avoid stale-closure overwrites (matches the legacy contract).
      const fresh = await idbLoadCategories();
      const next = updater(fresh);
      await idbSaveCategories(next);
      // Keep the mirror in sync with the canonical persisted state.
      setCategoryStoreRecords(next);
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
  }, `category:${label}`);
}


export const categoryRepository = {
  // reads
  snapshot: getCategorySnapshot,
  // writes
  commit,
  replaceAll,
};
