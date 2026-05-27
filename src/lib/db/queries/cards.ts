// ─────────────────────────────────────────────────────────────────────────────
// Cards repository — PR-9 A1b P1.5.
//
// SQLite-primary read layer for the `cards` table. The write path stays in
// `cardRepository` (RAM commit + persist-queue → SQLite mirror), but every
// indexed read lives here so:
//   • Hooks/selectors never import `db.cards.*` directly.
//   • Bootstrap, surgical reloads, and TanStack `useQuery` callers all share
//     a single SQL-backed seam that falls back to Dexie when SQLite isn't
//     available (Vite dev preview, tests without the wasm worker).
//
// Codec: `decodeCard` from `row-codecs.ts` parses the JSON payload column.
// Indexed columns are denormalised inside the row but the canonical shape
// always comes from `payload`.
//
// `cardsByTag` stays Dexie-only — `tags` is a multi-entry index that doesn't
// have a flat SQLite equivalent and is only used by low-frequency callers.
// ─────────────────────────────────────────────────────────────────────────────
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { decodeCard } from "@/lib/persistence/sqlite/row-codecs";
import { logger } from "@/lib/logger";

// ── Executor accessor (same pattern as sources/mind-maps/mnemonics) ─────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[cards-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
}

function decodeRows(rows: readonly { payload: string }[]): Card[] {
  const out: Card[] = [];
  for (const row of rows) {
    try { out.push(decodeCard(row as unknown as Record<string, string>)); }
    catch (err) { logger.warn("[cards-repo] decode failed, skipping row", err); }
  }
  return out;
}

// ── Bulk readers ─────────────────────────────────────────────────────────

export async function listAllCards(): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>("SELECT payload FROM cards");
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite listAll failed", err);
    }
  }
  try { return await db.cards.toArray(); }
  catch (err) {
    logger.warn("[cards-repo] dexie listAll failed", err);
    return [];
  }
}

/** Surgical lookup by ids. Used by `cardRepository.reloadFromIdb` (surgical path). */
export async function getCardsByIds(ids: readonly string[]): Promise<(Card | undefined)[]> {
  if (ids.length === 0) return [];
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const placeholders = ids.map(() => "?").join(",");
      const rows = await exec.all<{ id: string; payload: string }>(
        `SELECT id, payload FROM cards WHERE id IN (${placeholders})`,
        ids as readonly string[],
      );
      const byId = new Map<string, Card>();
      for (const row of rows) {
        try { byId.set(row.id, decodeCard(row as unknown as Record<string, string>)); }
        catch (err) { logger.warn("[cards-repo] decode failed in bulkGet", { id: row.id, err }); }
      }
      return ids.map((id) => byId.get(id));
    } catch (err) {
      logger.warn("[cards-repo] sqlite bulkGet failed", err);
    }
  }
  try { return await db.cards.bulkGet([...ids]); }
  catch (err) {
    logger.warn("[cards-repo] dexie bulkGet failed", err);
    return ids.map(() => undefined);
  }
}

// ── Indexed scoped readers ───────────────────────────────────────────────

export async function cardsByCategory(categoryId: string): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM cards WHERE categoryId = ?", [categoryId],
      );
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardsByCategory failed", { categoryId, err });
    }
  }
  return db.cards.where("categoryId").equals(categoryId).toArray();
}

export async function cardsBySubcategory(
  categoryId: string,
  subcategoryId: string,
): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM cards WHERE categoryId = ? AND subcategoryId = ?",
        [categoryId, subcategoryId],
      );
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardsBySubcategory failed", err);
    }
  }
  return db.cards
    .where("[categoryId+subcategoryId]")
    .equals([categoryId, subcategoryId])
    .toArray();
}

export async function cardsByChapter(
  categoryId: string,
  chapterId: string,
): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM cards WHERE categoryId = ? AND chapterId = ?",
        [categoryId, chapterId],
      );
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardsByChapter failed", err);
    }
  }
  return db.cards
    .where("[categoryId+chapterId]")
    .equals([categoryId, chapterId])
    .toArray();
}

export async function cardsByType(categoryId: string, type: Card["type"]): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM cards WHERE categoryId = ? AND type = ?",
        [categoryId, type],
      );
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardsByType failed", err);
    }
  }
  return db.cards.where("[categoryId+type]").equals([categoryId, type]).toArray();
}

export async function cardsBySource(sourceId: string): Promise<Card[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM cards WHERE sourceId = ? ORDER BY createdAt ASC",
        [sourceId],
      );
      return decodeRows(rows);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardsBySource failed", err);
    }
  }
  return db.cards
    .where("[sourceId+createdAt]")
    .between([sourceId, -Infinity], [sourceId, Infinity])
    .toArray();
}

/**
 * Dexie-only — `tags` is a multiEntry index without a flat SQLite mirror.
 * Low-frequency callers (search "by tag" UI). Moves to SQLite in P1.B when
 * a normalized cardTags join table is introduced.
 */
export function cardsByTag(tag: string, limit = 500): Promise<Card[]> {
  return db.cards.where("tags").equals(tag).limit(limit).toArray();
}

// ── Counts ───────────────────────────────────────────────────────────────

export async function cardCountByCategory(categoryId: string): Promise<number> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ?", [categoryId],
      );
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardCountByCategory failed", err);
    }
  }
  return db.cards.where("categoryId").equals(categoryId).count();
}

export async function cardCountByChapter(categoryId: string, chapterId: string): Promise<number> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ? AND chapterId = ?",
        [categoryId, chapterId],
      );
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardCountByChapter failed", err);
    }
  }
  return db.cards
    .where("[categoryId+chapterId]")
    .equals([categoryId, chapterId])
    .count();
}

export async function cardCountByType(categoryId: string, type: Card["type"]): Promise<number> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE categoryId = ? AND type = ?",
        [categoryId, type],
      );
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      logger.warn("[cards-repo] sqlite cardCountByType failed", err);
    }
  }
  return db.cards.where("[categoryId+type]").equals([categoryId, type]).count();
}

// ── Cache invalidation hook for TanStack bridges ─────────────────────────
//
// Listeners fire after a card mutation lands in RAM (cardRepository commits
// synchronously, persist-queue flushes async). The TanStack `cards` query
// bridge subscribes here so `useQuery(["cards", ...])` calls re-fetch from
// SQLite/Dexie once the mutation is visible.

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
