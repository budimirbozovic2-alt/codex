/**
 * Drafts repository — PR-9 A1c-2. SQLite-only.
 *
 * All functions swallow errors after logging — draft autosave 
 * must never throw into the React tree.
 */
import { type DraftRecord } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

// ─── Change emitter ─────────────────────────────────────────────

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

// ─── Codec ──────────────────────────────────────────────────────

interface EncodedDraft {
  key: string;
  source: string;
  updatedAt: number;
  payload: string;
}

function encodeDraft(record: DraftRecord): EncodedDraft {
  return {
    key: record.key,
    source: record.source,
    updatedAt: record.updatedAt ?? Date.now(),
    payload: JSON.stringify(record),
  };
}

function decodeDraft(row: { 
  payload: string 
}): DraftRecord | null {
  try { 
    return JSON.parse(row.payload) as DraftRecord; 
  } catch (err) {
    logger.warn("[drafts-repo] decode failed", err);
    return null;
  }
}

// ─── Read API ───────────────────────────────────────────────────

export async function getDraft(
  key: string
): Promise<DraftRecord | undefined> {
  const exec = await requireSqlExecutor("drafts:getDraft");
  try {
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM drafts WHERE key = ? LIMIT 1", 
      [key],
    );
    if (rows.length === 0) return undefined;
    return decodeDraft(rows[0]) ?? undefined;
  } catch (err) {
    logger.warn(
      "[drafts-repo] sqlite get failed", 
      { key, err }
    );
    return undefined;
  }
}

export async function listDraftsBySource(
  source: string
): Promise<DraftRecord[]> {
  const exec = await requireSqlExecutor("drafts:listDraftsBySource");
  try {
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM drafts WHERE source = ?", 
      [source],
    );
    return rows
      .map(decodeDraft)
      .filter((r): r is DraftRecord => r !== null);
  } catch (err) {
    logger.warn(
      "[drafts-repo] sqlite list failed", 
      { source, err }
    );
    return [];
  }
}

export async function listAllDrafts(): Promise<DraftRecord[]> {
  const exec = await requireSqlExecutor("drafts:listAllDrafts");
  try {
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM drafts"
    );
    return rows
      .map(decodeDraft)
      .filter((r): r is DraftRecord => r !== null);
  } catch (err) {
    logger.warn("[drafts-repo] sqlite listAll failed", err);
    return [];
  }
}

// ─── Write API ──────────────────────────────────────────────────

export async function putDraft(
  record: DraftRecord
): Promise<void> {
  const exec = await requireSqlExecutor("drafts:putDraft");
  try {
    const enc = encodeDraft(record);
    await exec.run(
      "INSERT OR REPLACE INTO drafts " +
      "(key, source, updatedAt, payload) VALUES (?, ?, ?, ?)",
      [enc.key, enc.source, enc.updatedAt, enc.payload],
    );
  } catch (err) {
    logger.warn(
      "[drafts-repo] sqlite put failed", 
      { key: record.key, err }
    );
  }
  _notify();
}

export async function deleteDraft(key: string): Promise<void> {
  const exec = await requireSqlExecutor("drafts:deleteDraft");
  try { 
    await exec.run(
      "DELETE FROM drafts WHERE key = ?", 
      [key]
    ); 
  } catch (err) { 
    logger.warn(
      "[drafts-repo] sqlite delete failed", 
      { key, err }
    ); 
  }
  _notify();
}

export async function bulkDeleteDrafts(
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const exec = await requireSqlExecutor("drafts:bulkDeleteDrafts");
  try {
    await exec.transaction(async (tx) => {
      await tx.runMany(
        "DELETE FROM drafts WHERE key = ?",
        keys.map((k) => [k])
      );
    });
  } catch (err) {
    logger.warn(
      "[drafts-repo] sqlite bulk delete failed", 
      err
    );
  }
  _notify();
}
