/**
 * Denormalised FSRS section index for O(1) due-card lookups via SQL JOIN.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { SqlBindValue, SqlExecutor } from "./executor";

export const CARD_SECTION_INDEX_UPSERT_SQL = `
  INSERT INTO card_sections_index (card_id, section_id, state, next_review)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(card_id, section_id) DO UPDATE SET
    state = excluded.state,
    next_review = excluded.next_review
`;

function bindCardSectionIndexRows(card: Card): readonly (readonly SqlBindValue[])[] {
  return card.sections.map((s) => [card.id, s.id, s.state, s.nextReview]);
}

/** Upsert index rows for one card; replace stale section rows for that card. */
export async function syncCardSectionsIndex(
  tx: SqlExecutor,
  card: Card,
): Promise<void> {
  await tx.run("DELETE FROM card_sections_index WHERE card_id = ?", [card.id]);
  const batches = bindCardSectionIndexRows(card);
  if (batches.length > 0) {
    await tx.runMany(CARD_SECTION_INDEX_UPSERT_SQL, batches);
  }
}

/** Batch upsert for many cards inside one transaction. */
export async function syncCardSectionsIndexMany(
  tx: SqlExecutor,
  cards: readonly Card[],
): Promise<void> {
  for (const card of cards) {
    await syncCardSectionsIndex(tx, card);
  }
}
