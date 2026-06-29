/**
 * JSON-native card UPDATE statements (SQLite json_set / json_remove).
 *
 * Shared by `cardRepository` so denormalised columns
 * and `payload` stay in sync without a full decode/re-encode round-trip.
 */

/** Clear sourceId / textAnchor / needsReview for ids that currently have sourceId set. */
export function sqlClearCardLinksIn(placeholders: string): string {
  return `UPDATE cards
      SET sourceId  = NULL,
          updatedAt = ?,
          payload   = json_set(
                        json_remove(
                          payload,
                          '$.sourceId',
                          '$.textAnchor',
                          '$.needsReview'
                        ),
                        '$.updatedAt', ?
                      )
    WHERE id IN (${placeholders})
      AND sourceId IS NOT NULL`;
}

export const SQL_CLEAR_NEEDS_REVIEW = `UPDATE cards
    SET updatedAt = ?,
        payload   = json_set(
                      json_remove(payload, '$.needsReview'),
                      '$.updatedAt', ?
                    )
  WHERE id = ?
    AND json_extract(payload, '$.needsReview') IS NOT NULL`;

export const SQL_SET_NEEDS_REVIEW = `UPDATE cards
    SET updatedAt = ?,
        payload   = json_set(
                      json_set(payload, '$.needsReview', json('true')),
                      '$.updatedAt', ?
                    )
  WHERE id = ?`;

export const SQL_UPDATE_CHAPTER = `UPDATE cards
    SET chapterId = ?,
        updatedAt = ?,
        payload   = json_set(
                      json_set(
                        json_set(payload, '$.chapterId', ?),
                        '$.chapterOrder', ?
                      ),
                      '$.updatedAt', ?
                    )
  WHERE id = ?`;
