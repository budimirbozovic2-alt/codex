/**
 * Sources repository — PR-9 A1c-2.
 *
 * SQLite-only read/write for the `sources` table. In non-Electron contexts
 * (Vite dev preview), reads short-circuit to empty defaults and writes
 * become no-ops; PROD throws via `assertDesktop`.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { Source } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";
import { withSqlTiming } from "./_shared/sql-timing";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) { notifyExecutorNull("sources", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[sources-repo] sqlite executor unavailable", err);
    notifyExecutorNull("sources", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[sources-repo] ${label} — no executor (dev shell)`);
  return null;
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
  const exec = await requireExecutor("getSource");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM sources WHERE id = ? LIMIT 1", [id],
  );
  if (rows.length === 0) return undefined;
  return decodeSource(rows[0]) ?? undefined;
}

export async function listAllSources(): Promise<Source[]> {
  return withSqlTiming("listAllSources", async () => {
    const exec = await requireExecutor("listAllSources");
    if (!exec) return [];
    const rows = await exec.all<{ payload: string }>("SELECT payload FROM sources");
    return rows.map(decodeSource).filter((s): s is Source => s !== null);
  });
}

export async function countAllSources(): Promise<number> {
  const exec = await requireExecutor("countAllSources");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>("SELECT COUNT(*) AS n FROM sources");
  return Number(rows[0]?.n ?? 0);
}

export async function listSourcesByCategory(categoryId: string): Promise<Source[]> {
  const exec = await requireExecutor("listSourcesByCategory");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM sources WHERE categoryId = ?", [categoryId],
  );
  return rows.map(decodeSource).filter((s): s is Source => s !== null);
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putSource(source: Source): Promise<void> {
  const exec = await requireExecutor("putSource");
  if (!exec) throw new Error("NO_EXECUTOR");
  await exec.run(INSERT_SQL, bindSource(source));
}

/**
 * Delete a source and unlink any cards that reference it. Single atomic
 * SQLite transaction. Returns the IDs of cards whose `sourceId` was cleared
 * so the caller can notify in-memory card state listeners.
 */
export async function deleteSourceAndUnlinkCards(id: string): Promise<string[]> {
  const clearedIds: string[] = [];
  const exec = await requireExecutor("deleteSourceAndUnlinkCards");
  if (!exec) throw new Error("NO_EXECUTOR");

  await exec.transaction(async (tx) => {
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
      } catch (err) {
        // PR-H2: payload parse failed — we can't safely re-encode the JSON,
        // but we MUST still null the FK column so the source DELETE below
        // doesn't leave a dangling `sourceId` inside the embedded JSON
        // (the column would be SET-NULL'd by the FK, but the in-payload
        // copy that the app actually reads would still point at a deleted
        // source). Cards-changed listeners still need to hear about this
        // card so they can refetch, so include it in clearedIds.
        logger.warn("[sources-repo] card re-encode failed; nulling FK column only", { id: row.id, err });
        await tx.run("UPDATE cards SET sourceId = NULL WHERE id = ?", [row.id]);
      }
      clearedIds.push(row.id);
    }
    await tx.run("DELETE FROM sources WHERE id = ?", [id]);
  });

  return clearedIds;
}
