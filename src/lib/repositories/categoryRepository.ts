// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for `categoryRecords`.
//
// Post Task-B: the EventBus CATEGORIES_UPDATED fan-out is gone. Every write
// goes through Zustand `categoryStore`, which is the SSOT all readers
// subscribe to via `useSyncExternalStore`. External callers that bypass
// this repository (e.g. backup-restore) push directly into the store via
// `setCategoryStoreRecords`.
//
// A2 — `deleteAsync` runs a single SQLite transaction that re-parents (or
// purges) cards + sources, then deletes the category row. FK CASCADE on
// the schema then wipes mindMaps / mnemonics / knowledgeBaseArticles in
// the same atomic step. The Dexie mirror tear-down is orchestrated by
// `category-deletion-service.ts` via the per-domain `*ByCategoryDexie`
// helpers exposed from `@/lib/db/queries`.
// ─────────────────────────────────────────────────────────────────────────────
import { idbLoadCategories, idbSaveCategories } from "@/lib/db";
import type { CategoryRecord } from "@/lib/db-types";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { createKeyedMutex } from "@/lib/concurrency";
import {
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";

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

// ─── A2 — SQLite-primary delete with FK CASCADE ──────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[category-repo] sqlite executor unavailable", err);
    return null;
  }
}

export interface DeleteCategoryOpts {
  /** When true: drop cards + sources for this category. When false: re-parent. */
  purgeCards: boolean;
  /** Re-parent target when `purgeCards === false`. Empty string skips re-parent. */
  fallbackId: string;
}

/**
 * Delete a category and cascade its children in one SQLite transaction.
 * FK CASCADE on the schema wipes mindMaps / mnemonics / knowledgeBaseArticles
 * automatically; cards + sources are handled explicitly so the `purgeCards`
 * vs. re-parent semantics survive (FK can't conditionally null-out).
 *
 * Returns ok even if the SQLite executor isn't available (Vite dev, tests
 * without the wasm worker) — callers still rely on the Dexie mirror sweep
 * orchestrated by `category-deletion-service`.
 */
export function deleteAsync(
  id: string,
  opts: DeleteCategoryOpts,
): Promise<WriteResult<void>> {
  return wrapWrite(async () => {
    if (!id) return;
    const exec = await tryGetExecutor();
    if (!exec) return; // Dexie-only environment — service handles the mirror.

    await exec.transaction(async (tx) => {
      if (opts.purgeCards) {
        // Explicit DELETE keeps semantics obvious; FK CASCADE would also
        // wipe these on the categories DELETE below, but reading the SQL
        // top-to-bottom is clearer with the explicit purge.
        await tx.run("DELETE FROM cards   WHERE categoryId = ?", [id]);
        await tx.run("DELETE FROM sources WHERE categoryId = ?", [id]);
      } else if (opts.fallbackId) {
        const now = Date.now();
        await tx.run(
          `UPDATE cards
             SET categoryId = ?, subcategoryId = NULL, chapterId = NULL, updatedAt = ?
           WHERE categoryId = ?`,
          [opts.fallbackId, now, id],
        );
        await tx.run(
          "UPDATE sources SET categoryId = ? WHERE categoryId = ?",
          [opts.fallbackId, id],
        );
      }
      // Final blow — FK CASCADE wipes mindMaps + mnemonics + KB articles.
      await tx.run("DELETE FROM categories WHERE id = ?", [id]);
    });
  });
}


export const categoryRepository = {
  // reads
  snapshot: getCategorySnapshot,
  // writes
  commit,
  replaceAll,
  deleteAsync,
};
