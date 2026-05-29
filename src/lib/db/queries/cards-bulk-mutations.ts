// ─────────────────────────────────────────────────────────────────────────────
// Cards bulk mutations — A2 collapse (json_set/json_remove pattern).
//
// Single-statement UPDATEs that keep the denormalised indexed columns
// (`subcategoryId`, `chapterId`, `updatedAt`) AND the JSON `payload` in sync
// inside one SQLite transaction. The payload is the source of truth for
// `decodeCard`, so any change to the indexed columns MUST mirror into
// payload via SQLite's JSON1 functions or `getCard()` returns stale data.
//
// Replaces the legacy SELECT → mutate → cardMapBulkPut round-trip used by
// `useCategoryManagement.deleteSubcategory / deleteChapter /
// bulkUpdateSubcategory`. Each helper is one round-trip to the worker, no
// JS decode, no per-row JSON re-encode.
// ─────────────────────────────────────────────────────────────────────────────
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

async function tryGetExecutor(label: string): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull(label, "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn(`[cards-bulk-mutations] ${label} executor unavailable`, err);
    notifyExecutorNull(label, "error");
    return null;
  }
}

/**
 * Clear `subcategoryId` + `chapterId` for every card under (categoryId,
 * subcategoryId). Used when a subcategory is deleted from the taxonomy.
 * Updates indexed columns AND payload in one statement.
 */
export async function clearCardsSubcategoryRefs(
  categoryId: string,
  subcategoryId: string,
): Promise<void> {
  const exec = await tryGetExecutor("clearCardsSubcategoryRefs");
  if (!exec) return;
  const now = Date.now();
  await exec.run(
    `UPDATE cards
        SET subcategoryId = NULL,
            chapterId     = NULL,
            updatedAt     = ?,
            payload       = json_set(
                              json_remove(payload, '$.subcategoryId', '$.chapterId'),
                              '$.updatedAt', ?
                            )
      WHERE categoryId = ? AND subcategoryId = ?`,
    [now, now, categoryId, subcategoryId],
  );
}

/**
 * Clear `chapterId` for every card under (categoryId, subcategoryId,
 * chapterId). Used when a chapter is deleted from the taxonomy.
 */
export async function clearCardsChapterRefs(
  categoryId: string,
  subcategoryId: string,
  chapterId: string,
): Promise<void> {
  const exec = await tryGetExecutor("clearCardsChapterRefs");
  if (!exec) return;
  const now = Date.now();
  await exec.run(
    `UPDATE cards
        SET chapterId = NULL,
            updatedAt = ?,
            payload   = json_set(
                          json_remove(payload, '$.chapterId'),
                          '$.updatedAt', ?
                        )
      WHERE categoryId    = ?
        AND subcategoryId = ?
        AND chapterId     = ?`,
    [now, now, categoryId, subcategoryId, chapterId],
  );
}

/**
 * Reassign a list of cards to a new subcategoryId. Used for the Structure
 * Manager's "bulk move" action. Chunked at 500 ids/IN-clause to keep within
 * SQLite's parameter limit comfortably.
 */
export async function reassignCardsSubcategory(
  ids: readonly string[],
  subcategoryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const exec = await tryGetExecutor("reassignCardsSubcategory");
  if (!exec) return;
  const now = Date.now();
  const CHUNK = 500;
  await exec.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const placeholders = slice.map(() => "?").join(",");
      await tx.run(
        `UPDATE cards
            SET subcategoryId = ?,
                updatedAt     = ?,
                payload       = json_set(payload,
                                         '$.subcategoryId', ?,
                                         '$.updatedAt',     ?)
          WHERE id IN (${placeholders})`,
        [subcategoryId, now, subcategoryId, now, ...slice],
      );
    }
  });
}
