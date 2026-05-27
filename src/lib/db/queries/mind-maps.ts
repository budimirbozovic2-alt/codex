/**
 * Mind maps repository — PR-9 A1b P1.2.
 *
 * SQLite-primary read/write for the `mindMaps` table. Mirrors the pattern
 * established by `sources.ts` / `drafts.ts`:
 *   1. Try SQLite (when running in Electron).
 *   2. Mirror write to Dexie for one soak release.
 *   3. Fall back to Dexie-only in Vite dev preview (no Electron shell).
 *
 * Listeners (`onMindMapsChanged`) and the in-memory cache stay in
 * `mindmap-storage.ts` — this module only exposes the data plane so the
 * legacy SSOT façade keeps notifying its subscribers untouched.
 *
 * Note: `MindMapDoc.categoryId` is optional in the domain shape, but the
 * SQLite schema requires it NOT NULL. Mind maps without a categoryId are
 * Dexie-only (never written to SQLite); this matches today's reality where
 * every produced mind map is created against a subject.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db, type MindMapDoc } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[mindmaps-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
}

// ─── Codec ──────────────────────────────────────────────────────────────

function decodeMindMap(row: { payload: string }): MindMapDoc | null {
  try { return JSON.parse(row.payload) as MindMapDoc; }
  catch (err) {
    logger.warn("[mindmaps-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload)
  VALUES (?, ?, ?, ?, ?)
`;

// ─── Read API ───────────────────────────────────────────────────────────

export async function getMindMap(id: string): Promise<MindMapDoc | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mindMaps WHERE id = ? LIMIT 1", [id],
      );
      if (rows.length > 0) {
        const decoded = decodeMindMap(rows[0]);
        if (decoded) return decoded;
      }
    } catch (err) {
      logger.warn("[mindmaps-repo] sqlite get failed", { id, err });
    }
  }
  try { return await db.mindMaps.get(id); }
  catch (err) {
    logger.warn("[mindmaps-repo] dexie get failed", { id, err });
    return undefined;
  }
}

export async function listAllMindMaps(): Promise<MindMapDoc[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mindMaps ORDER BY updatedAt DESC",
      );
      const decoded = rows.map(decodeMindMap).filter((d): d is MindMapDoc => d !== null);
      if (decoded.length > 0) return decoded;
    } catch (err) {
      logger.warn("[mindmaps-repo] sqlite listAll failed", err);
    }
  }
  try { return await db.mindMaps.orderBy("updatedAt").reverse().toArray(); }
  catch (err) {
    logger.warn("[mindmaps-repo] dexie listAll failed", err);
    return [];
  }
}

export async function listMindMapsByCategory(categoryId: string): Promise<MindMapDoc[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mindMaps WHERE categoryId = ? ORDER BY updatedAt DESC",
        [categoryId],
      );
      return rows.map(decodeMindMap).filter((d): d is MindMapDoc => d !== null);
    } catch (err) {
      logger.warn("[mindmaps-repo] sqlite listByCategory failed", { categoryId, err });
    }
  }
  try {
    const all = await db.mindMaps.where("categoryId").equals(categoryId).toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    logger.warn("[mindmaps-repo] dexie listByCategory failed", { categoryId, err });
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putMindMap(doc: MindMapDoc): Promise<void> {
  const exec = await tryGetExecutor();
  // Schema requires categoryId NOT NULL — skip SQLite for unscoped docs.
  if (exec && doc.categoryId) {
    try {
      await exec.run(INSERT_SQL, [
        doc.id,
        doc.categoryId,
        doc.title,
        doc.updatedAt,
        JSON.stringify(doc),
      ]);
    } catch (err) {
      logger.warn("[mindmaps-repo] sqlite put failed", { id: doc.id, err });
      throw err;
    }
  }
  try { await db.mindMaps.put(doc); }
  catch (err) {
    logger.warn("[mindmaps-repo] dexie mirror put failed", { id: doc.id, err });
    throw err;
  }
}

export async function deleteMindMap(id: string): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run("DELETE FROM mindMaps WHERE id = ?", [id]); }
    catch (err) {
      logger.warn("[mindmaps-repo] sqlite delete failed", { id, err });
    }
  }
  try { await db.mindMaps.delete(id); }
  catch (err) {
    logger.warn("[mindmaps-repo] dexie delete failed", { id, err });
    throw err;
  }
}

// ── A2 — Dexie mirror helper for category-deletion cascade ──────────────
export async function deleteMindMapsByCategoryDexie(categoryId: string): Promise<number> {
  try {
    return await db.mindMaps.where("categoryId").equals(categoryId).delete();
  } catch (err) {
    logger.warn("[mindmaps-repo] dexie deleteByCategory failed", { categoryId, err });
    return 0;
  }
}
