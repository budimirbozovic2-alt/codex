/**
 * Sources repository — PR-9 A1b P1.
 *
 * SQLite-primary read/write for the `sources` table. Pattern mirrors
 * `drafts.ts` / `settings.ts`:
 *   1. Try SQLite (when running in Electron).
 *   2. Mirror write to Dexie for one soak release (rollback insurance,
 *      backup builder still reads from Dexie).
 *   3. Fall back to Dexie-only in the Vite dev preview (no Electron shell).
 *
 * `deleteSourceAndUnlinkCards` is exposed as a single cross-table operation
 * so the caller doesn't have to coordinate two writes — the cards/sources
 * mutation is one SQL transaction on the SQLite side, and one Dexie `rw`
 * transaction on the mirror side. Returns the IDs of cards whose
 * `sourceId` was cleared so the caller can notify in-memory card stores.
 *
 * Listeners (`onSourcesChanged`) stay in `sources-storage.ts` for now —
 * the repo only exposes the data plane.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db, type Source } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { logger } from "@/lib/logger";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[sources-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
}

// ─── Codec ──────────────────────────────────────────────────────────────

interface SourceRow {
  id: string;
  categoryId: string;
  title: string;
  version: number;
  createdAt: number;
  sourceKind: string | null;
  payload: string;
}

function encodeSource(s: Source): SourceRow {
  return {
    id: s.id,
    categoryId: s.categoryId,
    title: s.title,
    version: s.version ?? 1,
    createdAt: s.createdAt,
    sourceKind: s.sourceKind ?? null,
    payload: JSON.stringify(s),
  };
}

function decodeSource(row: { payload: string }): Source | null {
  try { return JSON.parse(row.payload) as Source; }
  catch (err) {
    logger.warn("[sources-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO sources (id, categoryId, title, version, createdAt, sourceKind, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

function bindSource(s: Source): (string | number | null)[] {
  const r = encodeSource(s);
  return [r.id, r.categoryId, r.title, r.version, r.createdAt, r.sourceKind, r.payload];
}

// ─── Read API ───────────────────────────────────────────────────────────

export async function getSource(id: string): Promise<Source | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM sources WHERE id = ? LIMIT 1", [id],
      );
      if (rows.length === 0) return undefined;
      const decoded = decodeSource(rows[0]);
      return decoded ?? undefined;
    } catch (err) {
      logger.warn("[sources-repo] sqlite get failed", { id, err });
    }
  }
  try { return await db.sources.get(id); }
  catch (err) {
    logger.warn("[sources-repo] dexie get failed", { id, err });
    return undefined;
  }
}

export async function listAllSources(): Promise<Source[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>("SELECT payload FROM sources");
      return rows.map(decodeSource).filter((s): s is Source => s !== null);
    } catch (err) {
      logger.warn("[sources-repo] sqlite listAll failed", err);
    }
  }
  try { return await db.sources.toArray(); }
  catch (err) {
    logger.warn("[sources-repo] dexie listAll failed", err);
    return [];
  }
}

export async function listSourcesByCategory(categoryId: string): Promise<Source[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM sources WHERE categoryId = ?", [categoryId],
      );
      return rows.map(decodeSource).filter((s): s is Source => s !== null);
    } catch (err) {
      logger.warn("[sources-repo] sqlite listByCategory failed", { categoryId, err });
    }
  }
  try { return await db.sources.where("categoryId").equals(categoryId).toArray(); }
  catch (err) {
    logger.warn("[sources-repo] dexie listByCategory failed", { categoryId, err });
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putSource(source: Source): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run(INSERT_SQL, bindSource(source)); }
    catch (err) {
      logger.warn("[sources-repo] sqlite put failed", { id: source.id, err });
      throw err; // surfacing matches the old saveSource() contract
    }
  }
  try { await db.sources.put(source); }
  catch (err) {
    logger.warn("[sources-repo] dexie mirror put failed", { id: source.id, err });
    throw err;
  }
}

/**
 * Delete a source and unlink any cards that reference it. Runs as a single
 * atomic operation on each backend (SQLite tx + Dexie rw tx). Returns the
 * IDs of cards whose `sourceId` was cleared so the caller can notify
 * in-memory card state listeners.
 */
export async function deleteSourceAndUnlinkCards(id: string): Promise<string[]> {
  const clearedIds: string[] = [];

  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.transaction(async (tx) => {
        // Find linked cards first so we can re-encode their payloads.
        const linked = await tx.all<{ id: string; payload: string }>(
          "SELECT id, payload FROM cards WHERE sourceId = ?", [id],
        );
        for (const row of linked) {
          try {
            const card = JSON.parse(row.payload) as Card;
            const cleaned: Card = {
              ...card,
              sourceId: undefined,
              textAnchor: undefined,
              needsReview: undefined,
            };
            await tx.run(
              "UPDATE cards SET sourceId = NULL, payload = ? WHERE id = ?",
              [JSON.stringify(cleaned), row.id],
            );
            clearedIds.push(row.id);
          } catch (err) {
            logger.warn("[sources-repo] card re-encode failed", { id: row.id, err });
          }
        }
        await tx.run("DELETE FROM sources WHERE id = ?", [id]);
      });
    } catch (err) {
      logger.warn("[sources-repo] sqlite delete tx failed", { id, err });
    }
  }

  // Dexie mirror — same shape so legacy readers (backup builder, useCards)
  // see consistent state for the soak window.
  try {
    await db.transaction("rw", [db.sources, db.cards], async () => {
      const linkedCards = await db.cards.where("sourceId").equals(id).toArray();
      if (linkedCards.length > 0) {
        const cleaned = linkedCards.map(c => ({
          ...c,
          sourceId: undefined,
          textAnchor: undefined,
          needsReview: undefined,
        }));
        await db.cards.bulkPut(cleaned);
        // Capture cleared IDs from Dexie path too, in case SQLite path
        // was unavailable (Vite dev) and we still need to notify listeners.
        for (const c of linkedCards) {
          if (!clearedIds.includes(c.id)) clearedIds.push(c.id);
        }
      }
      await db.sources.delete(id);
    });
  } catch (err) {
    logger.warn("[sources-repo] dexie delete tx failed", { id, err });
  }

  return clearedIds;
}

// ── A2 — Dexie mirror helpers for category-deletion cascade ─────────────
// SQLite side handled by single tx + FK CASCADE in categoryRepository.

/** Delete every Dexie `sources` row whose categoryId matches. Returns count. */
export async function deleteSourcesByCategoryDexie(categoryId: string): Promise<number> {
  try {
    return await db.sources.where("categoryId").equals(categoryId).delete();
  } catch (err) {
    logger.warn("[sources-repo] dexie deleteByCategory failed", { categoryId, err });
    return 0;
  }
}

/** Re-parent Dexie `sources` from one category to another. */
export async function reparentSourcesByCategoryDexie(
  fromCategoryId: string,
  toCategoryId: string,
): Promise<number> {
  try {
    return await db.sources.where("categoryId").equals(fromCategoryId).modify({
      categoryId: toCategoryId,
    });
  } catch (err) {
    logger.warn("[sources-repo] dexie reparentByCategory failed",
      { fromCategoryId, toCategoryId, err });
    return 0;
  }
}
