// ─────────────────────────────────────────────────────────────────────────────
// Cards repository — PR-9 A1c-2.
//
// SQLite-only read layer for the `cards` table. The write path stays in
// `cardRepository` (RAM commit + persist-queue → SQLite). Every indexed
// read lives here so hooks/selectors never reach into Dexie directly.
//
// In non-Electron contexts (Vite dev preview, tests without the wasm
// worker), reads short-circuit to an empty result and the dev shell
// receives a warning via `assertDesktop()`; PROD builds throw on miss.
//
// Codec: `decodeCard` from `row-codecs.ts` parses the JSON payload column.
// ─────────────────────────────────────────────────────────────────────────────
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { Card } from "@/lib/spaced-repetition";
import { decodeCard, CardDecodeError } from "@/lib/persistence/sqlite/row-codecs";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

// ── Executor accessor ────────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("cards", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[cards-repo] sqlite executor unavailable", err);
    notifyExecutorNull("cards", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[cards-repo] ${label} — no executor (dev shell)`);
  return null;
}

// ── Corruption telemetry ─────────────────────────────────────────────────
//
// `decodeCard` throws `CardDecodeError` on malformed JSON or missing required
// keys. Readers below catch and skip those rows so the UI keeps rendering,
// but the failed ids are appended to a bounded ring buffer + broadcast on a
// listener channel so the Health Monitor can surface them.
const CORRUPT_RING_MAX = 50;
const _corruptIds = new Set<string>();
type CorruptListener = (ids: readonly string[]) => void;
const _corruptListeners = new Set<CorruptListener>();

function recordCorruptIds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  for (const id of ids) {
    _corruptIds.add(id);
    if (_corruptIds.size > CORRUPT_RING_MAX) {
      // Drop the oldest (Set iteration is insertion order).
      const first = _corruptIds.values().next().value;
      if (first !== undefined) _corruptIds.delete(first);
    }
  }
  const snapshot = Array.from(_corruptIds);
  for (const fn of _corruptListeners) {
    try { fn(snapshot); } catch (err) { logger.warn("[cards-repo] corrupt listener threw", err); }
  }
}

/** Snapshot of recent decode-failure ids (capped at 50). */
export function getRecentCorruptCardIds(): string[] {
  return Array.from(_corruptIds);
}

/** Subscribe to corruption events. Fires synchronously on each batch. */
export function onCorruptCards(fn: CorruptListener): () => void {
  _corruptListeners.add(fn);
  return () => { _corruptListeners.delete(fn); };
}

/** Test seam — wipe the ring buffer between test cases. */
export function __resetCorruptCardIds(): void { _corruptIds.clear(); }

function decodeRows(rows: readonly { payload: string }[]): Card[] {
  const out: Card[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    try { out.push(decodeCard(row as unknown as Record<string, string>)); }
    catch (err) {
      if (err instanceof CardDecodeError) failed.push(err.id);
      logger.warn("[cards-repo] decode failed, skipping row", err);
    }
  }
  if (failed.length > 0) recordCorruptIds(failed);
  return out;
}


// ── Bulk readers ─────────────────────────────────────────────────────────

export async function listAllCards(): Promise<Card[]> {
  const exec = await requireExecutor("listAllCards");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>("SELECT payload FROM cards");
  return decodeRows(rows);
}

/** Surgical lookup by ids. */
export async function getCardsByIds(ids: readonly string[]): Promise<(Card | undefined)[]> {
  if (ids.length === 0) return [];
  const exec = await requireExecutor("getCardsByIds");
  if (!exec) return ids.map(() => undefined);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await exec.all<{ id: string; payload: string }>(
    `SELECT id, payload FROM cards WHERE id IN (${placeholders})`,
    ids as readonly string[],
  );
  const byId = new Map<string, Card>();
  const failed: string[] = [];
  for (const row of rows) {
    try { byId.set(row.id, decodeCard(row as unknown as Record<string, string>)); }
    catch (err) {
      if (err instanceof CardDecodeError) failed.push(err.id);
      logger.warn("[cards-repo] decode failed in bulkGet", { id: row.id, err });
    }
  }
  if (failed.length > 0) recordCorruptIds(failed);
  return ids.map((id) => byId.get(id));
}

}

// ── Indexed scoped readers ───────────────────────────────────────────────

export async function cardsByCategory(categoryId: string): Promise<Card[]> {
  const exec = await requireExecutor("cardsByCategory");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE categoryId = ?", [categoryId],
  );
  return decodeRows(rows);
}

export async function cardsBySubcategory(
  categoryId: string,
  subcategoryId: string,
): Promise<Card[]> {
  const exec = await requireExecutor("cardsBySubcategory");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE categoryId = ? AND subcategoryId = ?",
    [categoryId, subcategoryId],
  );
  return decodeRows(rows);
}

export async function cardsByChapter(
  categoryId: string,
  chapterId: string,
): Promise<Card[]> {
  const exec = await requireExecutor("cardsByChapter");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE categoryId = ? AND chapterId = ?",
    [categoryId, chapterId],
  );
  return decodeRows(rows);
}

export async function cardsByType(categoryId: string, type: Card["type"]): Promise<Card[]> {
  const exec = await requireExecutor("cardsByType");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE categoryId = ? AND type = ?",
    [categoryId, type],
  );
  return decodeRows(rows);
}

export async function cardsBySource(sourceId: string): Promise<Card[]> {
  const exec = await requireExecutor("cardsBySource");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE sourceId = ? ORDER BY createdAt ASC",
    [sourceId],
  );
  return decodeRows(rows);
}

/**
 * Tag search. `tags` is a JSON-array column on the payload; we LIKE-scan it
 * with a coarse delimiter so the call site stays Dexie-free. Low frequency.
 */
export async function cardsByTag(tag: string, limit = 500): Promise<Card[]> {
  const exec = await requireExecutor("cardsByTag");
  if (!exec) return [];
  const needle = `%"${tag.replace(/"/g, '\\"')}"%`;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards WHERE payload LIKE ? LIMIT ?",
    [needle, limit],
  );
  // Verify hit by parsing payload — LIKE may match substrings inside other fields.
  return decodeRows(rows).filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
}

// ── Counts ───────────────────────────────────────────────────────────────

export async function countAllCards(): Promise<number> {
  const exec = await requireExecutor("countAllCards");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>("SELECT COUNT(*) AS n FROM cards");
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByCategory(categoryId: string): Promise<number> {
  const exec = await requireExecutor("cardCountByCategory");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ?", [categoryId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByChapter(categoryId: string, chapterId: string): Promise<number> {
  const exec = await requireExecutor("cardCountByChapter");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ? AND chapterId = ?",
    [categoryId, chapterId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function cardCountByType(categoryId: string, type: Card["type"]): Promise<number> {
  const exec = await requireExecutor("cardCountByType");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ? AND type = ?",
    [categoryId, type],
  );
  return Number(rows[0]?.n ?? 0);
}

// ── Cache invalidation hook for TanStack bridges ─────────────────────────

type CardsChangedListener = () => void;
const _listeners = new Set<CardsChangedListener>();

export function onCardsChanged(fn: CardsChangedListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

export function notifyCardsChanged(): void {
  for (const fn of _listeners) {
    try { fn(); } catch (err) { logger.warn("[cards-repo] listener threw", err); }
  }
}
