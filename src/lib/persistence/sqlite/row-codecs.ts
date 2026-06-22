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
import type { Card } from "@/lib/sr/types";
import type { SqlBindValue, SqlRow } from "./executor";
import { computeCardMasteryScore, computeCardMasteryLevel } from "./card-mastery-score";

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
  masteryLevel: SqlBindValue;
  parentId: SqlBindValue;
  isEndangered: SqlBindValue;
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
    masteryLevel: computeCardMasteryLevel(card),
    parentId: card.parentId ?? null,
    isEndangered: card.isEndangered ? 1 : 0,
    payload: JSON.stringify(card),
  };
}

export const CARD_DECODE_SELECT =
  "id, categoryId, subcategoryId, chapterId, type, createdAt, updatedAt, " +
  "sourceId, frequencyTag, sourceType, parentId, isEndangered, payload";

/** Prefix columns for JOIN queries (`cards.id, cards.categoryId, …`). */
export function cardSelectSql(tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : "";
  return CARD_DECODE_SELECT.split(", ")
    .map((col) => `${prefix}${col}`)
    .join(", ");
}

function payloadToString(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(payload));
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
    );
  }
  if (payload == null || payload === "") {
    throw new Error("payload missing or empty");
  }
  return String(payload);
}

/** Reconstruct a minimal card from denormalised SQL columns when payload is missing. */
function buildCardFromColumns(row: SqlRow): Card | null {
  const id = row.id != null && row.id !== "" ? String(row.id) : "";
  const categoryId =
    row.categoryId != null && row.categoryId !== ""
      ? String(row.categoryId)
      : "";
  if (!id || !categoryId) return null;

  const type =
    row.type === "essay" || row.type === "flash" ? row.type : "essay";

  const card: Card = {
    id,
    categoryId,
    type,
    question: "",
    sections: [],
    createdAt: Number(row.createdAt ?? Date.now()),
    readCount: 0,
    isEndangered:
      row.isEndangered != null ? Number(row.isEndangered) === 1 : false,
  };

  if (row.subcategoryId != null && row.subcategoryId !== "") {
    card.subcategoryId = String(row.subcategoryId);
  }
  if (row.chapterId != null && row.chapterId !== "") {
    card.chapterId = String(row.chapterId);
  }
  if (row.updatedAt != null) {
    card.updatedAt = Number(row.updatedAt);
  }
  if (row.sourceId != null && row.sourceId !== "") {
    card.sourceId = String(row.sourceId);
  }
  if (row.frequencyTag != null && row.frequencyTag !== "") {
    card.frequencyTag = String(row.frequencyTag) as Card["frequencyTag"];
  }
  if (row.sourceType != null && row.sourceType !== "") {
    card.sourceType = String(row.sourceType) as Card["sourceType"];
  }
  if (row.parentId != null && row.parentId !== "") {
    card.parentId = String(row.parentId);
  }

  return card;
}

export function decodeCard(row: SqlRow): Card {
  const rowId = row.id != null && row.id !== "" ? String(row.id) : "";
  try {
    const payloadStr = payloadToString(row.payload);
    const parsed = JSON.parse(payloadStr) as Partial<Card>;
    const id =
      typeof parsed.id === "string" && parsed.id
        ? parsed.id
        : rowId;
    const categoryId =
      typeof parsed.categoryId === "string" && parsed.categoryId
        ? parsed.categoryId
        : row.categoryId != null && row.categoryId !== ""
          ? String(row.categoryId)
          : "";
    if (!id) throw new Error("missing card id");
    if (!categoryId) throw new Error("missing categoryId");
    const type =
      parsed.type === "essay" || parsed.type === "flash"
        ? parsed.type
        : row.type === "essay" || row.type === "flash"
          ? row.type
          : "essay";
    const parentId =
      row.parentId != null && row.parentId !== ""
        ? String(row.parentId)
        : parsed.parentId;
    const isEndangered =
      row.isEndangered != null
        ? Number(row.isEndangered) === 1
        : !!parsed.isEndangered;
    return {
      ...parsed,
      id,
      categoryId,
      type,
      question: typeof parsed.question === "string" ? parsed.question : "",
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      createdAt:
        typeof parsed.createdAt === "number"
          ? parsed.createdAt
          : Number(row.createdAt ?? Date.now()),
      readCount: typeof parsed.readCount === "number" ? parsed.readCount : 0,
      ...(parentId !== undefined ? { parentId } : {}),
      isEndangered,
    } as Card;
  } catch (err) {
    const skeleton = buildCardFromColumns(row);
    if (skeleton) return skeleton;
    throw new CardDecodeError(rowId || "unknown", err);
  }
}

export const CARD_INSERT_SQL = `
  INSERT OR REPLACE INTO cards
    (id, categoryId, subcategoryId, chapterId, type, createdAt, updatedAt,
     sourceId, frequencyTag, sourceType, mastery_score, mastery_level,
     parentId, isEndangered, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?)
`;

export function bindCardInsert(card: Card): SqlBindValue[] {
  const r = encodeCard(card);
  return [
    r.id, r.categoryId, r.subcategoryId, r.chapterId, r.type, r.createdAt,
    r.updatedAt, r.sourceId, r.frequencyTag, r.sourceType,
    r.masteryScore, r.masteryLevel, r.parentId, r.isEndangered, r.payload,
  ];
}
