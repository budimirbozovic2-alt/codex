/**
 * Knowledge-base (Zettelkasten) articles repository — PR-9 A1c-2.
 * SQLite-only read/write.
 */
import type { SqlBindValue, SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";
import { withSqlTiming } from "./_shared/sql-timing";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) { notifyExecutorNull("knowledgeBase", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[kb-articles-repo] sqlite executor unavailable", err);
    notifyExecutorNull("knowledgeBase", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[kb-articles-repo] ${label} — no executor (dev shell)`);
  return null;
}

// ─── Change emitter ─────────────────────────────────────────────────────

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
  const exec = await requireExecutor("getArticle");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM knowledgeBaseArticles WHERE id = ? LIMIT 1", [id],
  );
  if (rows.length === 0) return undefined;
  return decodeArticle(rows[0]) ?? undefined;
}

export async function listAllArticles(): Promise<KnowledgeBaseArticle[]> {
  return withSqlTiming("listAllArticles", async () => {
    const exec = await requireExecutor("listAllArticles");
    if (!exec) return [];
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM knowledgeBaseArticles ORDER BY updatedAt DESC",
    );
    return rows.map(decodeArticle).filter((d): d is KnowledgeBaseArticle => d !== null);
  });
}

export async function listArticlesBySubject(subjectId: string): Promise<KnowledgeBaseArticle[]> {
  const exec = await requireExecutor("listArticlesBySubject");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM knowledgeBaseArticles WHERE subjectId = ? ORDER BY updatedAt DESC",
    [subjectId],
  );
  return rows.map(decodeArticle).filter((d): d is KnowledgeBaseArticle => d !== null);
}

export async function findArticleByTitle(
  subjectId: string,
  title: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const trimmed = title.trim();
  if (!trimmed) return undefined;

  const exec = await requireExecutor("findArticleByTitle");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM knowledgeBaseArticles
       WHERE subjectId = ?
         AND TRIM(title) = ? COLLATE NOCASE
       LIMIT 1`,
    [subjectId, trimmed],
  );
  if (rows.length === 0) return undefined;
  return decodeArticle(rows[0]) ?? undefined;
}

// ─── Header / index lookups (no JSON.parse) ────────────────────────────

export type KnowledgeBaseArticleHeader = {
  id: string;
  subjectId: string;
  title: string;
  updatedAt: number;
  isIndex: boolean;
};

function decodeHeaderRow(row: {
  id: string; subjectId: string; title: string; updatedAt: number; isIndex: number;
}): KnowledgeBaseArticleHeader {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    updatedAt: Number(row.updatedAt),
    isIndex: !!row.isIndex,
  };
}

export async function listArticleHeadersBySubject(
  subjectId: string,
): Promise<KnowledgeBaseArticleHeader[]> {
  const exec = await requireExecutor("listArticleHeadersBySubject");
  if (!exec) return [];
  const rows = await exec.all<{
    id: string; subjectId: string; title: string; updatedAt: number; isIndex: number;
  }>(
    `SELECT id, subjectId, title, updatedAt, isIndex
       FROM knowledgeBaseArticles
       WHERE subjectId = ?
       ORDER BY updatedAt DESC`,
    [subjectId],
  );
  return rows.map(decodeHeaderRow);
}

/** Indexed lookup — uses idx_kb_subject_isIndex. Single row. */
export async function getIndexArticle(
  subjectId: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const exec = await requireExecutor("getIndexArticle");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM knowledgeBaseArticles
       WHERE subjectId = ? AND isIndex = 1
       ORDER BY updatedAt DESC
       LIMIT 1`,
    [subjectId],
  );
  if (rows.length === 0) return undefined;
  return decodeArticle(rows[0]) ?? undefined;
}


export async function putArticle(article: KnowledgeBaseArticle): Promise<void> {
  const exec = await requireExecutor("putArticle");
  if (!exec) return;
  if (!article.subjectId) {
    logger.warn("[kb-articles-repo] put skipped — missing subjectId", { id: article.id });
    return;
  }
  await exec.run(INSERT_SQL, bindRow(article));
  notifyKnowledgeBaseChanged();
}

export async function bulkPutArticles(articles: readonly KnowledgeBaseArticle[]): Promise<void> {
  if (articles.length === 0) return;
  const exec = await requireExecutor("bulkPutArticles");
  if (!exec) return;
  await exec.transaction(async (tx) => {
    const batches = articles
      .filter((a) => Boolean(a.subjectId))
      .map((a) => bindRow(a));
    if (batches.length > 0) await tx.runMany(INSERT_SQL, batches);
  });

  notifyKnowledgeBaseChanged();
}

export async function deleteArticle(id: string): Promise<void> {
  const exec = await requireExecutor("deleteArticle");
  if (!exec) return;
  await exec.run("DELETE FROM knowledgeBaseArticles WHERE id = ?", [id]);
  notifyKnowledgeBaseChanged();
}
