/**
 * Row codecs — PR-8 M1.
 *
 * Convert between SQLite row shapes (denormalised columns + JSON payload) and
 * domain shapes (`Card`). Indexed columns are denormalised mirrors of fields
 * inside `payload` so query-by-column stays fast. Codecs MUST keep them in
 * sync — `encodeCard` is the single writer.
 *
 * Zero-`any`. Decode failures throw `CardDecodeError` so corrupt rows surface
 * loudly instead of silently returning broken cards.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { SqlBindValue, SqlRow } from "./executor";
import { computeCardMasteryScore } from "./card-mastery-score";

export class CardDecodeError extends Error {
  constructor(public readonly id: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`[sqlite:cards] decode failed for id=${id}: ${msg}`);
    this.name = "CardDecodeError";
  }
}

interface CardRowBindings {
  id: SqlBindValue;
  categoryId: SqlBindValue;
  subcategoryId: SqlBindValue;
  chapterId: SqlBindValue;
  type: SqlBindValue;
  createdAt: SqlBindValue;
  updatedAt: SqlBindValue;
  sourceId: SqlBindValue;
  frequencyTag: SqlBindValue;
  sourceType: SqlBindValue;
  masteryScore: SqlBindValue;
  payload: SqlBindValue;
}

function encodeCard(card: Card): CardRowBindings {
  return {
    id: card.id,
    categoryId: card.categoryId,
    subcategoryId: card.subcategoryId ?? null,
    chapterId: card.chapterId ?? null,
    type: card.type,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt ?? null,
    sourceId: card.sourceId ?? null,
    frequencyTag: card.frequencyTag ?? null,
    sourceType: card.sourceType ?? null,
    masteryScore: computeCardMasteryScore(card),
    payload: JSON.stringify(card),
  };
}

export const CARD_INSERT_SQL = `
  INSERT OR REPLACE INTO cards
    (id, categoryId, subcategoryId, chapterId, type, createdAt, updatedAt,
     sourceId, frequencyTag, sourceType, mastery_score, payload)
  VALUES (?,  ?,          ?,             ?,         ?,    ?,         ?,
          ?,        ?,            ?,          ?,       ?)
`;

export function bindCardInsert(card: Card): SqlBindValue[] {
  const r = encodeCard(card);
  return [
    r.id, r.categoryId, r.subcategoryId, r.chapterId, r.type, r.createdAt,
    r.updatedAt, r.sourceId, r.frequencyTag, r.sourceType, r.masteryScore, r.payload,
  ];
}

export function decodeCard(row: SqlRow): Card {
  const id = String(row.id ?? "");
  try {
    const payload = row.payload;
    if (typeof payload !== "string") throw new Error("payload not a string");
    const card = JSON.parse(payload) as Card;
    if (typeof card.id !== "string" || typeof card.categoryId !== "string") {
      throw new Error("missing required keys");
    }
    return card;
  } catch (err) {
    throw new CardDecodeError(id, err);
  }
}
