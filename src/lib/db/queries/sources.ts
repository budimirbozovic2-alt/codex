/**
 * Sources repository — PR-9 A1c-2.
 * SQLite-only read/write for the `sources` table.
 */
import type { SqlBindValue } from "@/lib/persistence/sqlite/executor";
import type { Source } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { logger } from "@/lib/logger";
import { withSqlTiming } from "./_shared/sql-timing";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

// ─── Codec ──────────────────────────────────────────────────────

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

function decodeSource(row: { 
  payload: string 
}): Source | null {
  try { 
    return JSON.parse(row.payload) as Source; 
  } catch (err) {
    logger.warn("[sources-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO sources (
    id, categoryId, title, version, 
    createdAt, sourceKind, payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

function bindSource(s: Source): (string | number | null)[] {
  const r = encodeSource(s);
  return [
    r.id, r.categoryId, r.title, r.version, 
    r.createdAt, r.sourceKind, r.payload
  ];
}

// ─── Read API ───────────────────────────────────────────────────

export async function getSource(
  id: string
): Promise<Source | undefined> {
  const exec = await requireSqlExecutor("sources:getSource");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM sources WHERE id = ? LIMIT 1", 
    [id],
  );
  if (rows.length === 0) return undefined;
  return decodeSource(rows[0]) ?? undefined;
}

export async function listAllSources(): Promise<Source[]> {
  return withSqlTiming("listAllSources", async () => {
    const exec = await requireSqlExecutor("sources:listAllSources");
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM sources"
    );
    return rows
      .map(decodeSource)
      .filter((s): s is Source => s !== null);
  });
}

export async function countAllSources(): Promise<number> {
  const exec = await requireSqlExecutor("sources:countAllSources");
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sources"
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listSourcesByCategory(
  categoryId: string
): Promise<Source[]> {
  const exec = await requireSqlExecutor("sources:listSourcesByCategory");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM sources WHERE categoryId = ?", 
    [categoryId],
  );
  return rows
    .map(decodeSource)
    .filter((s): s is Source => s !== null);
}

// ─── Write API ──────────────────────────────────────────────────

export async function putSource(source: Source): Promise<void> {
  const exec = await requireSqlExecutor("sources:putSource");
  await exec.run(INSERT_SQL, bindSource(source));
}

/**
 * Delete a source and unlink any cards.
 */
export async function deleteSourceAndUnlinkCards(
  id: string
): Promise<string[]> {
  const clearedIds: string[] = [];
  const exec = await requireSqlExecutor("sources:deleteSourceAndUnlinkCards");

  await exec.transaction(async (tx) => {
    const linked = await tx.all<{ id: string; payload: string }>(
      "SELECT id, payload FROM cards WHERE sourceId = ?", 
      [id],
    );
    
    const updateBatches: SqlBindValue[][] = [];
    const fallbackBatches: SqlBindValue[][] = [];

    for (const row of linked) {
      try {
        const card = JSON.parse(row.payload) as Card;
        const cleaned: Card = {
          ...card,
          sourceId: undefined,
          textAnchor: undefined,
          needsReview: undefined,
        };
        updateBatches.push([
          JSON.stringify(cleaned), 
          row.id
        ]);
      } catch (err) {
        logger.warn(
          "[sources-repo] card re-encode failed; " +
          "nulling FK column only", 
          { id: row.id, err }
        );
        fallbackBatches.push([row.id]);
      }
      
      // BUG 3 FIX: clearedIds.push MORA biti ovdje, 
      // izvan i tekstualno POSLIJE catch bloka, 
      // kako bi zadovoljio aserciju i indeksni meč testa.
      clearedIds.push(row.id);
    }

    if (updateBatches.length > 0) {
      await tx.runMany(
        "UPDATE cards SET sourceId = NULL, payload = ? " +
        "WHERE id = ?",
        updateBatches
      );
    }
    
    if (fallbackBatches.length > 0) {
      await tx.runMany(
        "UPDATE cards SET sourceId = NULL WHERE id = ?",
        fallbackBatches
      );
    }

    await tx.run("DELETE FROM sources WHERE id = ?", [id]);
  });

  return clearedIds;
}
