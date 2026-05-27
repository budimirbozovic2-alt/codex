/**
 * Knowledge-base (Zettelkasten) articles repository — PR-9 A1b P1.4.
 *
 * SQLite-primary read/write for the `knowledgeBaseArticles` table. Mirrors
 * the pattern of `mind-maps.ts` / `mnemonics.ts`:
 *   1. Try SQLite (when running in Electron).
 *   2. Mirror writes to Dexie for one soak release.
 *   3. Fall back to Dexie-only in Vite dev preview (no Electron shell).
 *
 * Indexed columns (subjectId, title NOCASE, updatedAt, isIndex) are
 * denormalised mirrors of the JSON payload. The codec is the single writer
 * — keep `bindRow` in sync if `KnowledgeBaseArticle` grows new indexed
 * fields.
 *
 * The complex transactional flows (`bulkCreateArticlesIfMissing`,
 * `ensureIndexArticle`) remain in `zettelkasten-storage.ts` because they
 * need Dexie's `rw` semantics for atomic open-or-create; this module
 * exposes `bulkPutArticles` so the storage façade can mirror the post-tx
 * batch into SQLite in one round-trip.
 */
import type { SqlBindValue, SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db, type KnowledgeBaseArticle } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─── Executor accessor ──────────────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[kb-articles-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
}

// ─── Change emitter (PR-7f M2 — TanStack bridge) ────────────────────────

type KnowledgeBaseListener = () => void;
const _kbListeners = new Set<KnowledgeBaseListener>();

export function onKnowledgeBaseChanged(fn: KnowledgeBaseListener): () => void {
  _kbListeners.add(fn);
  return () => { _kbListeners.delete(fn); };
}

export function notifyKnowledgeBaseChanged(): void {
  for (const fn of _kbListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

// ─── Codec ──────────────────────────────────────────────────────────────


function decodeArticle(row: { payload: string }): KnowledgeBaseArticle | null {
  try { return JSON.parse(row.payload) as KnowledgeBaseArticle; }
  catch (err) {
    logger.warn("[kb-articles-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO knowledgeBaseArticles
    (id, subjectId, title, updatedAt, isIndex, payload)
  VALUES (?, ?, ?, ?, ?, ?)
`;

function bindRow(a: KnowledgeBaseArticle): SqlBindValue[] {
  return [
    a.id,
    a.subjectId,
    a.title,
    a.updatedAt,
    a.isIndex ? 1 : 0,
    JSON.stringify(a),
  ];
}

// ─── Read API ───────────────────────────────────────────────────────────

export async function getArticle(id: string): Promise<KnowledgeBaseArticle | undefined> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM knowledgeBaseArticles WHERE id = ? LIMIT 1", [id],
      );
      if (rows.length > 0) {
        const decoded = decodeArticle(rows[0]);
        if (decoded) return decoded;
      }
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite get failed", { id, err });
    }
  }
  try { return await db.knowledgeBaseArticles.get(id); }
  catch (err) {
    logger.warn("[kb-articles-repo] dexie get failed", { id, err });
    return undefined;
  }
}

/** Backup/health readers — full unscoped dump, sorted by updatedAt DESC. */
export async function listAllArticles(): Promise<KnowledgeBaseArticle[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM knowledgeBaseArticles ORDER BY updatedAt DESC",
      );
      return rows.map(decodeArticle).filter((d): d is KnowledgeBaseArticle => d !== null);
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite listAll failed", err);
    }
  }
  try {
    const all = await db.knowledgeBaseArticles.toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    logger.warn("[kb-articles-repo] dexie listAll failed", err);
    return [];
  }
}

/** Sorted by updatedAt DESC (matches the legacy Dexie order). */
export async function listArticlesBySubject(subjectId: string): Promise<KnowledgeBaseArticle[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM knowledgeBaseArticles WHERE subjectId = ? ORDER BY updatedAt DESC",
        [subjectId],
      );
      return rows.map(decodeArticle).filter((d): d is KnowledgeBaseArticle => d !== null);
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite listBySubject failed", { subjectId, err });
    }
  }
  try {
    const all = await db.knowledgeBaseArticles.where("subjectId").equals(subjectId).toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    logger.warn("[kb-articles-repo] dexie listBySubject failed", { subjectId, err });
    return [];
  }
}

/** Case-insensitive trimmed title lookup within a subject. */
export async function findArticleByTitle(
  subjectId: string,
  title: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const trimmed = title.trim();
  if (!trimmed) return undefined;

  const exec = await tryGetExecutor();
  if (exec) {
    try {
      // Uses idx_kb_subject_title_nocase. trim() is applied via SQL so we
      // catch payloads stored with incidental whitespace.
      const rows = await exec.all<{ payload: string }>(
        `SELECT payload FROM knowledgeBaseArticles
           WHERE subjectId = ?
             AND TRIM(title) = ? COLLATE NOCASE
           LIMIT 1`,
        [subjectId, trimmed],
      );
      if (rows.length > 0) {
        const decoded = decodeArticle(rows[0]);
        if (decoded) return decoded;
      }
      return undefined;
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite findByTitle failed", { subjectId, err });
    }
  }

  // Dexie fallback — exact match via compound index, then short-circuit
  // case-insensitive scan as a safety net.
  const exact = await db.knowledgeBaseArticles
    .where("[subjectId+title]")
    .equals([subjectId, trimmed])
    .first();
  if (exact) return exact;

  const normalized = trimmed.toLowerCase();
  return db.knowledgeBaseArticles
    .where("subjectId")
    .equals(subjectId)
    .filter(a => a.title.trim().toLowerCase() === normalized)
    .first();
}

// ─── Write API ──────────────────────────────────────────────────────────

export async function putArticle(article: KnowledgeBaseArticle): Promise<void> {
  const exec = await tryGetExecutor();
  // Schema requires subjectId NOT NULL — skip SQLite for unscoped rows
  // (should never happen in practice; defensive guard mirrors mind-maps).
  if (exec && article.subjectId) {
    try {
      await exec.run(INSERT_SQL, bindRow(article));
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite put failed", { id: article.id, err });
      throw err;
    }
  }
  try { await db.knowledgeBaseArticles.put(article); }
  catch (err) {
    logger.warn("[kb-articles-repo] dexie mirror put failed", { id: article.id, err });
    throw err;
  }
}

/** Batch mirror for post-tx flows (bulkCreateArticlesIfMissing, ensureIndexArticle). */
export async function bulkPutArticles(articles: readonly KnowledgeBaseArticle[]): Promise<void> {
  if (articles.length === 0) return;
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.transaction(async (tx) => {
        for (const a of articles) {
          if (!a.subjectId) continue;
          await tx.run(INSERT_SQL, bindRow(a));
        }
      });
    } catch (err) {
      logger.warn("[kb-articles-repo] sqlite bulkPut failed", { n: articles.length, err });
      throw err;
    }
  }
  // Dexie mirror is a no-op when the upstream caller already wrote to Dexie
  // inside its own rw transaction. Kept as a safety net for callers that
  // skipped that step.
  try { await db.knowledgeBaseArticles.bulkPut([...articles]); }
  catch (err) {
    logger.warn("[kb-articles-repo] dexie mirror bulkPut failed", err);
  }
}

export async function deleteArticle(id: string): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try { await exec.run("DELETE FROM knowledgeBaseArticles WHERE id = ?", [id]); }
    catch (err) {
      logger.warn("[kb-articles-repo] sqlite delete failed", { id, err });
    }
  }
  try { await db.knowledgeBaseArticles.delete(id); }
  catch (err) {
    logger.warn("[kb-articles-repo] dexie delete failed", { id, err });
    throw err;
  }
}
