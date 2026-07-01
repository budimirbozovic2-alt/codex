/**
 * Knowledge-base (Zettelkasten) articles repository — PR-9.
 * SQLite-only read/write.
 */
import type { SqlBindValue } from "@/lib/persistence/sqlite/executor";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { withSqlTiming } from "./_shared/sql-timing";
import { requireSqlExecutor } from "./_shared/require-sql-executor";
import { invalidateKnowledgeBaseQueries } from "@/lib/query/domain-invalidation";
import { migrateArticle } from "@/lib/editor-v4/migrate";
import {
  emitCardsChangedForRefs,
  type CardScopeRef,
} from "./cards-notify-scope";

// ─── Change emitter ─────────────────────────────────────────────

export function notifyKnowledgeBaseChanged(): void {
  invalidateKnowledgeBaseQueries();
}

// ─── Codec ──────────────────────────────────────────────────────

function decodeArticle(row: {
  payload: string;
}): KnowledgeBaseArticle | null {
  try {
    const parsed = JSON.parse(row.payload) as KnowledgeBaseArticle;
    // Decode-time backfill: legacy rows may still carry markdown-only `content`
    // in the JSON payload. migrateArticle is idempotent for v4 docs.
    return migrateArticle(parsed).record;
  } catch (err) {
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

// ─── Read API ───────────────────────────────────────────────────

export async function getArticle(
  id: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const exec = await requireSqlExecutor("kb:getArticle");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM knowledgeBaseArticles WHERE id = ? LIMIT 1",
    [id],
  );
  if (rows.length === 0) return undefined;
  return decodeArticle(rows[0]) ?? undefined;
}

export async function listAllArticles(): Promise<KnowledgeBaseArticle[]> {
  return withSqlTiming("listAllArticles", async () => {
    const exec = await requireSqlExecutor("kb:listAllArticles");
    const rows = await exec.all<{ payload: string }>(
      `SELECT payload FROM knowledgeBaseArticles ORDER BY updatedAt DESC`,
    );
    return rows
      .map(decodeArticle)
      .filter((d): d is KnowledgeBaseArticle => d !== null);
  });
}

export async function listArticlesBySubject(
  subjectId: string,
): Promise<KnowledgeBaseArticle[]> {
  const exec = await requireSqlExecutor("kb:listArticlesBySubject");
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM knowledgeBaseArticles
     WHERE subjectId = ? ORDER BY updatedAt DESC`,
    [subjectId],
  );
  return rows
    .map(decodeArticle)
    .filter((d): d is KnowledgeBaseArticle => d !== null);
}

export async function findArticleByTitle(
  subjectId: string,
  title: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const trimmed = title.trim();
  if (!trimmed) return undefined;

  const exec = await requireSqlExecutor("kb:findArticleByTitle");
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

/** Indexed lookup — uses idx_kb_subject_isIndex. Single row. */
export async function getIndexArticle(
  subjectId: string,
): Promise<KnowledgeBaseArticle | undefined> {
  const exec = await requireSqlExecutor("kb:getIndexArticle");
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

// ─── Write API ──────────────────────────────────────────────────

export async function putArticle(
  article: KnowledgeBaseArticle,
): Promise<void> {
  if (!article.subjectId) {
    logger.warn("[kb-articles-repo] put skipped — missing subjectId", {
      id: article.id,
    });
    return;
  }
  const exec = await requireSqlExecutor("kb:putArticle");
  await exec.run(INSERT_SQL, bindRow(article));
  notifyKnowledgeBaseChanged();
}

export async function bulkPutArticles(
  articles: readonly KnowledgeBaseArticle[],
): Promise<void> {
  if (articles.length === 0) return;
  const exec = await requireSqlExecutor("kb:bulkPutArticles");
  await exec.transaction(async (tx) => {
    const batches = articles
      .filter((a) => Boolean(a.subjectId))
      .map((a) => bindRow(a));
    if (batches.length > 0) {
      await tx.runMany(INSERT_SQL, batches);
    }
  });

  notifyKnowledgeBaseChanged();
}

export async function deleteArticle(id: string): Promise<void> {
  const exec = await requireSqlExecutor("kb:deleteArticle");
  let detachedRefs: CardScopeRef[] = [];
  await exec.transaction(async (tx) => {
    // Detach concept links so cards don't dangle on a deleted article. Explicit
    // (not relying on the FK ON DELETE SET NULL, which needs PRAGMA foreign_keys
    // and may be off on legacy DBs). Keeps the indexed column + payload in sync.
    detachedRefs = await tx.all<CardScopeRef>(
      `SELECT categoryId, subcategoryId, chapterId, sourceId
         FROM cards WHERE linkedArticleId = ?`,
      [id],
    );
    if (detachedRefs.length > 0) {
      const now = Date.now();
      await tx.run(
        `UPDATE cards
            SET linkedArticleId = NULL,
                updatedAt       = ?,
                payload         = json_set(
                                    json_remove(payload, '$.linkedArticleId'),
                                    '$.updatedAt', ?)
          WHERE linkedArticleId = ?`,
        [now, now, id],
      );
    }
    await tx.run("DELETE FROM knowledgeBaseArticles WHERE id = ?", [id]);
  });
  notifyKnowledgeBaseChanged();
  if (detachedRefs.length > 0) emitCardsChangedForRefs(detachedRefs);
}
