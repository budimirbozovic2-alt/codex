// ─────────────────────────────────────────────────────────────────
// Cards repository — PR-9 A1c-2.
// SQLite-only read layer for the `cards` table.
// ─────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";
import { 
  decodeCard, 
  CardDecodeError,
  CARD_DECODE_SELECT,
  cardSelectSql,
} from "@/lib/persistence/sqlite/row-codecs";
import type { SqlRow } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import { getBulkWriteDepth } from "@/lib/query/bulk-write-session-depth";
import { withSqlTiming } from "./_shared/sql-timing";
import { requireSqlExecutor } from "./_shared/require-sql-executor";
import {
  emitDomainChanged,
  onDomainChanged,
  type CardsChangedScope,
} from "@/lib/event-bus";

// ── Corruption telemetry ─────────────────────────────────────────

const CORRUPT_RING_MAX = 50;
const _corruptIds = new Set<string>();
type CorruptListener = (ids: readonly string[]) => void;
const _corruptListeners = new Set<CorruptListener>();

function recordCorruptIds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  for (const id of ids) {
    _corruptIds.add(id);
    if (_corruptIds.size > CORRUPT_RING_MAX) {
      const first = _corruptIds.values().next().value;
      if (first !== undefined) _corruptIds.delete(first);
    }
  }
  const snapshot = Array.from(_corruptIds);
  for (const fn of _corruptListeners) {
    try { 
      fn(snapshot); 
    } catch (err) { 
      logger.warn("[cards-repo] corrupt listener threw", err); 
    }
  }
}

export function getRecentCorruptCardIds(): string[] {
  return Array.from(_corruptIds);
}

export function onCorruptCards(fn: CorruptListener): () => void {
  _corruptListeners.add(fn);
  return () => { _corruptListeners.delete(fn); };
}

function decodeRows(rows: readonly SqlRow[]): Card[] {
  const out: Card[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    try { out.push(decodeCard(row)); }
    catch (err: unknown) {
      const id =
        err instanceof CardDecodeError
          ? err.id
          : row.id != null
            ? String(row.id)
            : "unknown";
      if (err instanceof CardDecodeError) failed.push(err.id);
      else failed.push(id);
      logger.warn("[cards-repo] decode failed, skipping row", { id, err });
    }
  }
  if (failed.length > 0) recordCorruptIds(failed);
  if (rows.length > 0 && out.length === 0) {
    logger.error(
      "[cards-repo] all card payloads failed decode — SQL rows exist but UI will be empty",
      { rowCount: rows.length, failedSample: failed.slice(0, 5) },
    );
  } else if (failed.length > 0) {
    logger.warn("[cards-repo] partial card decode failure", {
      decoded: out.length,
      failed: failed.length,
      total: rows.length,
    });
  }
  return out;
}

// ── Bulk readers ─────────────────────────────────────────────────

export async function listAllCards(): Promise<Card[]> {
  return withSqlTiming("listAllCards", async () => {
    const exec = await requireSqlExecutor("cards:listAllCards");
    const rows = await exec.all<SqlRow>(
      `SELECT ${CARD_DECODE_SELECT} FROM cards`,
    );
    return decodeRows(rows);
  });
}

/** Surgical lookup by ids. */
export async function getCardsByIds(
  ids: readonly string[]
): Promise<(Card | undefined)[]> {
  if (ids.length === 0) return [];
  const exec = await requireSqlExecutor("cards:getCardsByIds");
  
  const placeholders = ids.map(() => "?").join(",");
  const rows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards 
     WHERE id IN (${placeholders})`,
    ids as readonly string[],
  );
  
  const byId = new Map<string, Card>();
  const failed: string[] = [];
  for (const row of rows) {
    try { byId.set(String(row.id), decodeCard(row)); }
    catch (err: unknown) {
      if (err instanceof CardDecodeError) failed.push(err.id);
      logger.warn(
        "[cards-repo] decode failed in bulkGet", 
        { id: row.id, err }
      );
    }
  }
  if (failed.length > 0) recordCorruptIds(failed);

  return ids.map((id) => byId.get(id));
}

/** FSRS due cards via indexed JOIN (state != New, next_review <= now). */
export async function getDueCardsFromDb(
  nowMs: number,
  limit = 100,
): Promise<Card[]> {
  return withSqlTiming("getDueCardsFromDb", async () => {
    const exec = await requireSqlExecutor("cards:due");
    const rows = await exec.all<SqlRow>(
      `SELECT ${cardSelectSql("cards")}
         FROM cards
         INNER JOIN card_sections_index idx ON cards.id = idx.card_id
        WHERE idx.state != ? AND idx.next_review <= ?
        GROUP BY cards.id
        ORDER BY MIN(idx.next_review) ASC
        LIMIT ?`,
      [SectionState.New, nowMs, limit],
    );
    return decodeRows(rows);
  });
}

/** Card count where earliest non-New section is due. */
export async function countDueCardsFromDb(
  nowMs: number = Date.now(),
): Promise<number> {
  return withSqlTiming("countDueCardsFromDb", async () => {
    const exec = await requireSqlExecutor("cards:countDue");
    const rows = await exec.all<{ n: number }>(
      `SELECT COUNT(DISTINCT card_id) AS n
         FROM card_sections_index
        WHERE state != ? AND next_review <= ?`,
      [SectionState.New, nowMs],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

/** Per-category rounded average mastery score — no payload decode. */
export async function avgMasteryScoreByCategoryFromDb(
  categoryId: string,
): Promise<number> {
  return withSqlTiming("avgMasteryScoreByCategoryFromDb", async () => {
    const exec = await requireSqlExecutor("cards:avgMasteryByCategory");
    const rows = await exec.all<{ score: number }>(
      `SELECT ROUND(AVG(mastery_score)) AS score
         FROM cards
        WHERE categoryId = ?`,
      [categoryId],
    );
    return Number(rows[0]?.score ?? 0);
  });
}

/** Six-bucket mastery distribution (levels 0–5) — no payload decode. */
export type MasteryDistribution = readonly [
  number, number, number, number, number, number,
];

const EMPTY_MASTERY_DISTRIBUTION: MasteryDistribution = [0, 0, 0, 0, 0, 0];

export async function masteryDistributionByCategoryFromDb(
  categoryId: string,
): Promise<MasteryDistribution> {
  return withSqlTiming("masteryDistributionByCategoryFromDb", async () => {
    const exec = await requireSqlExecutor("cards:masteryDistByCategory");
    const rows = await exec.all<{ mastery_level: number; n: number }>(
      `SELECT mastery_level, COUNT(*) AS n
         FROM cards
        WHERE categoryId = ?
        GROUP BY mastery_level`,
      [categoryId],
    );
    const counts = [...EMPTY_MASTERY_DISTRIBUTION];
    for (const row of rows) {
      const level = Number(row.mastery_level);
      if (level >= 0 && level <= 5) {
        counts[level] = Number(row.n);
      }
    }
    return counts as MasteryDistribution;
  });
}

/** Per-category due count via SQL JOIN — no payload decode. */
export async function countDueCardsByCategoryFromDb(
  categoryId: string,
  nowMs: number = Date.now(),
): Promise<number> {
  return withSqlTiming("countDueCardsByCategoryFromDb", async () => {
    const exec = await requireSqlExecutor("cards:countDueByCategory");
    const rows = await exec.all<{ n: number }>(
      `SELECT COUNT(DISTINCT idx.card_id) AS n
         FROM card_sections_index idx
         INNER JOIN cards c ON c.id = idx.card_id
        WHERE c.categoryId = ? AND idx.state != ? AND idx.next_review <= ?`,
      [categoryId, SectionState.New, nowMs],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

// ── Indexed scoped readers ───────────────────────────────────────

export async function cardsByCategory(
  categoryId: string
): Promise<Card[]> {
  return withSqlTiming("cardsByCategory", async () => {
    const exec = await requireSqlExecutor("cards:cardsByCategory");
    const rows = await exec.all<SqlRow>(
      `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE categoryId = ?`, 
      [categoryId],
    );
    return decodeRows(rows);
  });
}

export async function cardsBySubcategory(
  categoryId: string,
  subcategoryId: string,
): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsBySubcategory");
  const rows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards 
     WHERE categoryId = ? AND subcategoryId = ?`,
    [categoryId, subcategoryId],
  );
  return decodeRows(rows);
}

export async function cardsByChapter(
  categoryId: string,
  chapterId: string,
): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsByChapter");
  const rows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards 
     WHERE categoryId = ? AND chapterId = ?`,
    [categoryId, chapterId],
  );
  return decodeRows(rows);
}

export async function cardsByType(
  categoryId: string, 
  type: Card["type"]
): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsByType");
  const rows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE categoryId = ? AND type = ?`,
    [categoryId, type],
  );
  return decodeRows(rows);
}

export async function cardsBySource(sourceId: string): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsBySource");
  const rows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE sourceId = ? 
     ORDER BY createdAt ASC`,
    [sourceId],
  );
  return decodeRows(rows);
}

export async function cardsByTag(
  tag: string,
  limit = 500,
): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsByTag");
  const rows = await exec.all<SqlRow>(
    `SELECT ${cardSelectSql("cards")} FROM cards, json_each(cards.payload, '$.tags') WHERE json_each.value = ? LIMIT ?`,
    [tag, limit],
  );
  return decodeRows(rows);
}

// ── Counts ───────────────────────────────────────────────────────

export async function countAllCards(): Promise<number> {
  const exec = await requireSqlExecutor("cards:countAllCards");
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards"
  );
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByCategory(
  categoryId: string
): Promise<number> {
  const exec = await requireSqlExecutor("cards:cardCountByCategory");
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ?", 
    [categoryId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByChapter(
  categoryId: string, 
  chapterId: string
): Promise<number> {
  const exec = await requireSqlExecutor("cards:cardCountByChapter");
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cards 
     WHERE categoryId = ? AND chapterId = ?`,
    [categoryId, chapterId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByType(
  categoryId: string, 
  type: Card["type"]
): Promise<number> {
  const exec = await requireSqlExecutor("cards:cardCountByType");
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ? AND type = ?",
    [categoryId, type],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countEndangeredEssaysByCategoryFromDb(
  categoryId: string,
): Promise<number> {
  const exec = await requireSqlExecutor("cards:countEndangeredByCategory");
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cards
      WHERE categoryId = ? AND type = 'essay' AND isEndangered = 1`,
    [categoryId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countEndangeredEssaysAllFromDb(): Promise<number> {
  const exec = await requireSqlExecutor("cards:countEndangeredAll");
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cards
      WHERE type = 'essay' AND isEndangered = 1`,
  );
  return Number(rows[0]?.n ?? 0);
}

// ── Cache invalidation hook for TanStack bridges ─────────────────

// CardsScope is an alias for CardsChangedScope from event-bus-types.
// Kept as a re-export for backward compatibility with existing callers.
export type CardsScope = CardsChangedScope;

export function onCardsChanged(
  fn: (scope: CardsScope) => void
): () => void {
  return onDomainChanged((p) => {
    if (p.domain === "cards") fn(p.scope);
  });
}

export function notifyCardsChanged(
  scope: CardsScope = { kind: "all" }
): void {
  if (getBulkWriteDepth() > 0 && scope.kind !== "derived") {
    logger.warn("[cards] notifyCardsChanged suppressed during bulk write session", {
      scope,
    });
    return;
  }
  emitDomainChanged({ domain: "cards", scope });
}