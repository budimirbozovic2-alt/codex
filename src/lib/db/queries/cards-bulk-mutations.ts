// ─────────────────────────────────────────────────────────────────
// Cards bulk mutations — A2 collapse (json_set/json_remove pattern)
//
// Single-statement UPDATEs that keep the denormalised indexed 
// columns (`subcategoryId`, `chapterId`, `updatedAt`) AND the JSON 
// `payload` in sync inside one SQLite transaction. 
// ─────────────────────────────────────────────────────────────────
import type { 
  SqlExecutor 
} from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import { 
  notifyExecutorNull 
} from "./_shared/executor-telemetry";

async function tryGetExecutor(
  label: string
): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import(
      "@/lib/electron-integration"
    );
    if (!isElectron() && import.meta.env.PROD) { 
      notifyExecutorNull(label, "non-electron"); 
      return null; 
    }
    const { getOpfsSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn(
      `[cards-bulk-mutations] ${label} executor unavailable`, 
      err
    );
    notifyExecutorNull(label, "error");
    return null;
  }
}

/**
 * Clear `subcategoryId` + `chapterId` for every card under 
 * (categoryId, subcategoryId). 
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
                              json_remove(
                                payload, 
                                '$.subcategoryId', 
                                '$.chapterId'
                              ),
                              '$.updatedAt', ?
                            )
      WHERE categoryId = ? AND subcategoryId = ?`,
    [now, now, categoryId, subcategoryId],
  );
}

/**
 * Clear `chapterId` for every card under (categoryId, 
 * subcategoryId, chapterId). 
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
 * Reassign a list of cards to a new subcategoryId. 
 * OPTIMIZACIJA: Koristi runMany umjesto IN(...) chunking-a za 
 * maksimalne performanse RPC mosta i izbjegavanje SQL limita.
 */
export async function reassignCardsSubcategory(
  ids: readonly string[],
  subcategoryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const exec = await tryGetExecutor("reassignCardsSubcategory");
  if (!exec) return;
  const now = Date.now();

  await exec.transaction(async (tx) => {
    // Matrica parametara: za svaki ID spremamo niz vrijednosti
    const batches = ids.map(id => [
      subcategoryId, 
      now, 
      subcategoryId, 
      now, 
      id
    ]);

    await tx.runMany(
      `UPDATE cards
          SET subcategoryId = ?,
              updatedAt     = ?,
              payload       = json_set(payload,
                                '$.subcategoryId', ?,
                                '$.updatedAt',     ?)
        WHERE id = ?`,
      batches
    );
  });
}