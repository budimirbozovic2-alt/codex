/**
 * Denormalises `isEndangered` on essay parents when flash satellites are graded.
 *
 * Runs inside the same SQLite transaction as the graded card write.
 */
import type { Card } from "@/lib/sr/types";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { SqlExecutor } from "./executor";
import {
  CARD_DECODE_SELECT,
  CARD_INSERT_SQL,
  bindCardInsert,
  decodeCard,
} from "./row-codecs";

export type EndangeredSyncAction = "marked" | "stabilized";

export interface ParentEndangeredSyncResult {
  /** Essay card id when its `isEndangered` column changed. */
  parentId: string | null;
  action: EndangeredSyncAction | null;
}

const REVIEW_LOG_INSERT_SQL =
  "INSERT INTO reviewLog (cardId, timestamp, payload) VALUES (?, ?, ?)";

/** Persist a review log row inside the graded-card transaction (before sibling checks). */
export async function insertReviewLogInTx(
  tx: SqlExecutor,
  entry: ReviewLogEntry,
): Promise<void> {
  await tx.run(REVIEW_LOG_INSERT_SQL, [
    entry.cardId,
    entry.timestamp,
    JSON.stringify(entry),
  ]);
}

async function latestGradeForCard(
  tx: SqlExecutor,
  cardId: string,
): Promise<number | null> {
  const rows = await tx.all<{ payload: string }>(
    `SELECT payload FROM reviewLog
      WHERE cardId = ?
      ORDER BY timestamp DESC
      LIMIT 1`,
    [cardId],
  );
  const row = rows[0];
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload) as { grade?: number };
    return typeof parsed.grade === "number" ? parsed.grade : null;
  } catch {
    return null;
  }
}

async function allSatellitesLastGradeAtLeast(
  tx: SqlExecutor,
  parentId: string,
  gradedCardId: string,
  currentGrade: number,
): Promise<boolean> {
  const siblings = await tx.all<{ id: string }>(
    `SELECT id FROM cards WHERE parentId = ? AND type = 'flash'`,
    [parentId],
  );
  if (siblings.length === 0) return false;

  for (const sibling of siblings) {
    const grade =
      sibling.id === gradedCardId
        ? currentGrade
        : await latestGradeForCard(tx, sibling.id);
    if (grade === null || grade < 3) return false;
  }
  return true;
}

async function writeParentEndangered(
  tx: SqlExecutor,
  parentId: string,
  endangered: boolean,
  now: number,
): Promise<boolean> {
  const rows = await tx.all<{ id: string; payload: string; parentId?: string | null; isEndangered?: number | null }>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE id = ?`,
    [parentId],
  );
  const row = rows[0];
  if (!row) return false;

  const parent = decodeCard(row);
  if (parent.type !== "essay") return false;
  if (!!parent.isEndangered === endangered) return false;

  const updated: Card = { ...parent, isEndangered: endangered, updatedAt: now };
  await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));
  return true;
}

/**
 * After a flash satellite FSRS write, sync the parent essay's endangered flag.
 */
export async function syncParentEndangeredOnFlashGrade(
  tx: SqlExecutor,
  gradedCard: Card,
  grade: number,
  now: number,
): Promise<ParentEndangeredSyncResult> {
  if (gradedCard.type !== "flash" || !gradedCard.parentId) {
    return { parentId: null, action: null };
  }

  const parentId = gradedCard.parentId;

  if (grade === 1) {
    const changed = await writeParentEndangered(tx, parentId, true, now);
    return {
      parentId: changed ? parentId : null,
      action: changed ? "marked" : null,
    };
  }

  if (grade >= 3) {
    const allClear = await allSatellitesLastGradeAtLeast(
      tx,
      parentId,
      gradedCard.id,
      grade,
    );
    if (allClear) {
      const changed = await writeParentEndangered(tx, parentId, false, now);
      return {
        parentId: changed ? parentId : null,
        action: changed ? "stabilized" : null,
      };
    }
  }

  return { parentId: null, action: null };
}
