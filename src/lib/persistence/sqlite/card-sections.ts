/**
 * Normalized FSRS section rows — TD-ARCH-8.
 * Replaces denormalized `card_sections_index` (state + next_review only).
 */
import type { Card } from "@/lib/sr/types";
import type { SqlBindValue, SqlExecutor } from "./executor";

export const CARD_SECTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS card_sections (
    card_id              TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    section_id           TEXT NOT NULL,
    state                INTEGER NOT NULL,
    stability            REAL NOT NULL DEFAULT 0,
    difficulty           REAL NOT NULL DEFAULT 0,
    interval_days        REAL NOT NULL DEFAULT 0,
    next_review          INTEGER NOT NULL,
    last_reviewed        INTEGER,
    lapses               INTEGER NOT NULL DEFAULT 0,
    elapsed_days         REAL NOT NULL DEFAULT 0,
    scheduled_days       REAL NOT NULL DEFAULT 0,
    first_review_pending INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (card_id, section_id)
  );
  CREATE INDEX IF NOT EXISTS idx_card_sections_due ON card_sections(state, next_review);
  CREATE INDEX IF NOT EXISTS idx_card_sections_card ON card_sections(card_id);
`;

export const CARD_SECTIONS_UPSERT_SQL = `
  INSERT INTO card_sections (
    card_id, section_id, state, stability, difficulty, interval_days,
    next_review, last_reviewed, lapses, elapsed_days, scheduled_days,
    first_review_pending
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(card_id, section_id) DO UPDATE SET
    state = excluded.state,
    stability = excluded.stability,
    difficulty = excluded.difficulty,
    interval_days = excluded.interval_days,
    next_review = excluded.next_review,
    last_reviewed = excluded.last_reviewed,
    lapses = excluded.lapses,
    elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    first_review_pending = excluded.first_review_pending
`;

function bindCardSectionRows(card: Card): readonly (readonly SqlBindValue[])[] {
  return card.sections.map((s) => [
    card.id,
    s.id,
    s.state,
    s.stability,
    s.difficulty,
    s.interval,
    s.nextReview,
    s.lastReviewed,
    s.lapses,
    s.elapsedDays,
    s.scheduledDays,
    s.firstReviewPending ? 1 : 0,
  ]);
}

async function tableExists(tx: SqlExecutor, name: string): Promise<boolean> {
  const rows = await tx.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Upsert normalized section rows for one card. */
export async function syncCardSections(
  tx: SqlExecutor,
  card: Card,
): Promise<void> {
  if (!(await tableExists(tx, "card_sections"))) return;
  await tx.run("DELETE FROM card_sections WHERE card_id = ?", [card.id]);
  const batches = bindCardSectionRows(card);
  if (batches.length > 0) {
    await tx.runMany(CARD_SECTIONS_UPSERT_SQL, batches);
  }
}

export async function syncCardSectionsMany(
  tx: SqlExecutor,
  cards: readonly Card[],
): Promise<void> {
  for (const card of cards) {
    await syncCardSections(tx, card);
  }
}
