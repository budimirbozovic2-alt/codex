// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for `categoryRecords`.
//
// A1c-4 F1: SQLite-primary. The Dexie `categories` mirror is gone — durable
// persistence runs through `queries/categories.ts` (single SQL transaction
// per commit). Zustand `categoryStore` remains the RAM SSOT all readers
// subscribe to via `useSyncExternalStore`; external callers that bypass this
// repository (e.g. backup-restore) still push directly into the store via
// `setCategoryStoreRecords`.
//
// A2 — `deleteAsync` runs a single SQLite transaction that re-parents (or
// purges) cards + sources, then deletes the category row. FK CASCADE on the
// schema then wipes mindMaps / mnemonics / knowledgeBaseArticles in the same
// atomic step.
// ─────────────────────────────────────────────────────────────────────────────
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
import {
  replaceAllCategories,
} from "@/lib/db/queries";

// ─── Read primitives ─────────────────────────────────────────────────────
export function getCategorySnapshot(): CategoryRecord[] {
  return getCategoryStoreRecords();
}

// ─── Write primitives ────────────────────────────────────────────────────

/**
 * Full replace — bootstrap, restore. Pushes into the SSOT synchronously.
 * Does NOT persist to SQLite on its own (the upstream caller — e.g.
 * `applyImportAtomically`, `loadInitialData` — has already done that).
 */
export function replaceAll(records: CategoryRecord[]): void {
  setCategoryStoreRecords(records);
}

// Mutex for serialising SQLite writes — prevents concurrent overwrites when
// two optimistic updates race (e.g. fast double-click on reorder). SQLite's
// own transaction would still serialise at the FS layer, but read-modify-
// write here needs the mutex to avoid stale-snapshot overwrites.
const _saveMutex = createKeyedMutex();

/**
 * Optimistic commit: pushes the optimistic value into the SSOT store, then
 * persists to SQLite — both **inside** a serialised mutex so concurrent
 * commits cannot race each other's rollback target.
 *
 * Audit v2 / Wave A.2: the previous Wave-1 fix moved only the rollback
 * snapshot inside the mutex but left the optimistic write outside. For
 * concurrent commits A→B and B→C in the same tick, when A failed the
 * rollback target captured inside the mutex was already C (B's optimistic
 * write had run before A's mutex turn). The guard `rollbackTo === optimistic`
 * was false so the store stayed on C — A's true rollback target was lost.
 *
 * Fix: compute updater + apply + persist atomically. The mutex window is
 * <1ms for typical workloads (≤9 categories); render latency is unaffected.
 */
export async function commit(
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string,
): Promise<void> {
  return _saveMutex.runExclusive(null, async () => {
    const preOptimistic = getCategoryStoreRecords();
    const optimistic = updater(preOptimistic);
    setCategoryStoreRecords(optimistic);
    try {
      await replaceAllCategories(optimistic);
    } catch (e) {
      logger.error(`[${label}] SQLite persist failed, rolling back`, e);
      setCategoryStoreRecords(preOptimistic);
      toast.error("Greška", { description: "Promjena nije sačuvana." });
      throw e instanceof Error ? e : new Error(String(e));
    }
  }, `category:${label}`);
}


// ─── A2 — SQLite-primary delete with FK CASCADE ──────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) return null;
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
 * Returns ok even if the SQLite executor isn't available (Vite dev shell).
 */
export function deleteAsync(
  id: string,
  opts: DeleteCategoryOpts,
): Promise<WriteResult<void>> {
  return wrapWrite(async () => {
    if (!id) return;
    const exec = await tryGetExecutor();
    // Wave-1 fix: previously returned silently when executor was missing,
    // which meant the RAM store appeared "deleted" but SQLite kept the row
    // and the category reappeared on next boot.
    if (!exec) throw new Error("NO_EXECUTOR");

    await exec.transaction(async (tx) => {
      if (opts.purgeCards) {
        await tx.run("DELETE FROM cards WHERE categoryId = ?", [id]);
        await tx.run("DELETE FROM sources WHERE categoryId = ?", [id]);
      } else if (opts.fallbackId) {
        const now = Date.now();
        // A2 — keep JSON payload in sync with indexed columns via JSON1.
        // Cards: new categoryId, drop subcategory/chapter refs.
        await tx.run(
          `UPDATE cards
              SET categoryId    = ?,
                  subcategoryId = NULL,
                  chapterId     = NULL,
                  updatedAt     = ?,
                  payload       = json_set(
                                    json_remove(payload, '$.subcategoryId', '$.chapterId'),
                                    '$.categoryId', ?,
                                    '$.updatedAt',  ?
                                  )
            WHERE categoryId = ?`,
          [opts.fallbackId, now, opts.fallbackId, now, id],
        );
        // Sources: mirror new categoryId into payload JSON too.
        await tx.run(
          `UPDATE sources
              SET categoryId = ?,
                  payload    = json_set(payload, '$.categoryId', ?)
            WHERE categoryId = ?`,
          [opts.fallbackId, opts.fallbackId, id],
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
