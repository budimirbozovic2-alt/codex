/**
 * Drafts repository — PR-9 M3.
 *
 * SQLite-primary read/write for the `drafts` table. Pattern mirrors
 * `planner.ts` 1:1 — SQLite is SSOT in Electron, Dexie is a soak mirror
 * (for one release as rollback insurance + so legacy readers like
 * `emergency-export` continue to see fresh data), and a Dexie fallback in
 * the non-Electron Vite dev preview.
 *
 * All functions swallow errors after logging — draft autosave must never
 * throw into the React tree.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db, type DraftRecord } from "@/lib/db-schema";
import { logger } from "@/lib/logger";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[drafts-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
}

// ─── Change emitter ─────────────────────────────────────────────────────

type DraftsListener = () => void;
const _draftsListeners = new Set<DraftsListener>();

export function onDraftsChanged(fn: DraftsListener): () => void {
  _draftsListeners.add(fn);
  return () => { _draftsListeners.delete(fn); };
}

function _notify(): void {
  for (const fn of _draftsListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

// ─── Codec ──────────────────────────────────────────────────────────────

function encodeDraft(record: DraftRecord): { key: string; source: string; updatedAt: number; payload: string } {
  return {
    key: record.key,
    source: record.source,
    updatedAt: record.updatedAt,
    payload: JSON.stringify(record),
  };
}

function decodeDraft(row: { payload: string }): DraftRecord | null {
  try { return JSON.parse(row.payload) as DraftRecord; }
  catch (err) {
    logger.warn("[drafts-repo] decode failed", err);
    return null;
  }
}

// ─── Read API ───────────────────────────────────────────────────────────

export async function getDraft(key: string): Promise<DraftRecord | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM drafts WHERE key = ? LIMIT 1", [key],
      );
      if (rows.length === 0) return undefined;
      const decoded = decodeDraft(rows[0]);
      return decoded ?? undefined;
    } catch (err) {
      logger.warn("[drafts-repo] sqlite get failed", { key, err });
    }
  }
  try { return await db.drafts.get(key); }
  catch (err) {
    logger.warn("[drafts-repo] dexie get failed", { key, err });
    return undefined;
  }
}

export async function listDraftsBySource(source: string): Promise<DraftRecord[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM drafts WHERE source = ?", [source],
      );
      return rows.map(decodeDraft).filter((r): r is DraftRecord => r !== null);
    } catch (err) {
      logger.warn("[drafts-repo] sqlite list failed", { source, err });
    }
  }
  try { return await db.drafts.where("source").equals(source).toArray(); }
  catch (err) {
    logger.warn("[drafts-repo] dexie list failed", { source, err });
    return [];
  }
}

export async function listAllDrafts(): Promise<DraftRecord[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>("SELECT payload FROM drafts");
      return rows.map(decodeDraft).filter((r): r is DraftRecord => r !== null);
    } catch (err) {
      logger.warn("[drafts-repo] sqlite listAll failed", err);
    }
  }
  try { return await db.drafts.toArray(); }
  catch (err) {
    logger.warn("[drafts-repo] dexie listAll failed", err);
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putDraft(record: DraftRecord): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const enc = encodeDraft(record);
      await exec.run(
        "INSERT OR REPLACE INTO drafts (key, source, updatedAt, payload) VALUES (?, ?, ?, ?)",
        [enc.key, enc.source, enc.updatedAt, enc.payload],
      );
    } catch (err) {
      logger.warn("[drafts-repo] sqlite put failed", { key: record.key, err });
    }
  }
  // Dexie mirror (soak insurance).
  try { await db.drafts.put(record); }
  catch (err) { logger.warn("[drafts-repo] dexie mirror put failed", { key: record.key, err }); }
  _notify();
}

export async function deleteDraft(key: string): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run("DELETE FROM drafts WHERE key = ?", [key]); }
    catch (err) { logger.warn("[drafts-repo] sqlite delete failed", { key, err }); }
  }
  try { await db.drafts.delete(key); }
  catch (err) { logger.warn("[drafts-repo] dexie mirror delete failed", { key, err }); }
  _notify();
}

export async function bulkDeleteDrafts(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.transaction(async (tx) => {
        for (const k of keys) await tx.run("DELETE FROM drafts WHERE key = ?", [k]);
      });
    } catch (err) {
      logger.warn("[drafts-repo] sqlite bulk delete failed", err);
    }
  }
  try { await db.drafts.bulkDelete(keys); }
  catch (err) { logger.warn("[drafts-repo] dexie mirror bulk delete failed", err); }
  _notify();
}
