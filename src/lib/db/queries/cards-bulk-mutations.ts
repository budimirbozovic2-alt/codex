// ─────────────────────────────────────────────────────────────────
// Cards bulk mutations — A2 collapse (json_set/json_remove pattern)
//
// Single-statement UPDATEs that keep the denormalised indexed 
// columns (`subcategoryId`, `chapterId`, `updatedAt`) AND the JSON 
// `payload` in sync inside one SQLite transaction. 
// ─────────────────────────────────────────────────────────────────
import { requireSqlExecutor } from "./_shared/require-sql-executor";

/**
 * Clear `subcategoryId` + `chapterId` for every card under 
 * (categoryId, subcategoryId). 
 */
export async function clearCardsSubcategoryRefs(
  categoryId: string,
  subcategoryId: string,
): Promise<void> {
  const exec = await requireSqlExecutor("cards-bulk:clearCardsSubcategoryRefs");
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
  const exec = await requireSqlExecutor("cards-bulk:clearCardsChapterRefs");
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
  const exec = await requireSqlExecutor("cards-bulk:reassignCardsSubcategory");
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
