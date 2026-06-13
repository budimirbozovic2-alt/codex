// ─────────────────────────────────────────────────────────────────
// Cards repository — PR-9 A1c-2.
// SQLite-only read layer for the `cards` table.
// ─────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { 
  decodeCard, 
  CardDecodeError 
} from "@/lib/persistence/sqlite/row-codecs";
import { logger } from "@/lib/logger";
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

function decodeRows(rows: readonly { payload: string }[]): Card[] {
  const out: Card[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    try { out.push(decodeCard(row)); }
    catch (err: unknown) {
      if (err instanceof CardDecodeError) failed.push(err.id);
      logger.warn("[cards-repo] decode failed, skipping row", err);
    }
  }
  if (failed.length > 0) recordCorruptIds(failed);
  return out;
}

// ── Bulk readers ─────────────────────────────────────────────────

export async function listAllCards(): Promise<Card[]> {
  return withSqlTiming("listAllCards", async () => {
    const exec = await requireSqlExecutor("cards:listAllCards");
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM cards"
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
  const rows = await exec.all<{ id: string; payload: string }>(
    `SELECT id, payload FROM cards 
     WHERE id IN (${placeholders})`,
    ids as readonly string[],
  );
  
  const byId = new Map<string, Card>();
  const failed: string[] = [];
  for (const row of rows) {
    try { byId.set(row.id, decodeCard(row)); }
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

// ── Indexed scoped readers ───────────────────────────────────────

export async function cardsByCategory(
  categoryId: string
): Promise<Card[]> {
  return withSqlTiming("cardsByCategory", async () => {
    const exec = await requireSqlExecutor("cards:cardsByCategory");
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM cards WHERE categoryId = ?", 
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
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM cards 
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
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM cards 
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
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE categoryId = ? AND type = ?",
    [categoryId, type],
  );
  return decodeRows(rows);
}

export async function cardsBySource(sourceId: string): Promise<Card[]> {
  const exec = await requireSqlExecutor("cards:cardsBySource");
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM cards WHERE sourceId = ? 
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
  const rows = await exec.all<{ payload: string }>(
    `SELECT cards.payload FROM cards, json_each(cards.payload, '$.tags')
     WHERE json_unquote(json_each.value) = ?
     LIMIT ?`,
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
  emitDomainChanged({ domain: "cards", scope });
}