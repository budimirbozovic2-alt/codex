/**
 * Zettelkasten storage façade — A1c-4 F6.3 (Final Dexie Drop).
 *
 * SQLite-only: all reads and writes delegate to `@/lib/db/queries/knowledge-base`.
 * The pre-F6 hybrid that ran an atomic Dexie `rw` transaction and then
 * mirrored to SQLite is gone — SQLite is the SSOT.
 *
 * Race semantics for `bulkCreateArticlesIfMissing` / `ensureIndexArticle`:
 * single-user desktop client, so the read-then-write window is benign.
 * Even if two parallel callers raced, the `INSERT OR REPLACE` upsert and
 * the case-insensitive title dedup at the call site converge on the same
 * canonical row.
 */
import type { KnowledgeBaseArticle } from "./db-types";
import { assertTagsNormalized } from "./zettelkasten-tags";
import { assertAliasesNormalized } from "./zettelkasten-aliases";
import {
  getArticle as repoGetArticle,
  listArticlesBySubject as repoListBySubject,
  findArticleByTitle as repoFindByTitle,
  putArticle as repoPutArticle,
  bulkPutArticles as repoBulkPut,
  deleteArticle as repoDeleteArticle,
} from "./db/queries/knowledge-base";

import { logger } from "@/lib/logger";
export type { KnowledgeBaseArticle };

export async function loadArticlesBySubject(subjectId: string): Promise<KnowledgeBaseArticle[]> {
  return repoListBySubject(subjectId);
}

export async function getArticle(id: string): Promise<KnowledgeBaseArticle | undefined> {
  return repoGetArticle(id);
}

/** Case-insensitive title lookup within a subject. Used to resolve [[wiki-links]]. */
export async function findArticleByTitle(
  subjectId: string,
  title: string
): Promise<KnowledgeBaseArticle | undefined> {
  return repoFindByTitle(subjectId, title);
}

export async function saveArticle(article: KnowledgeBaseArticle): Promise<void> {
  if (import.meta.env.DEV) {
    assertTagsNormalized(article.tags);
    assertAliasesNormalized(article.aliases);
  }
  try {
    await repoPutArticle({ ...article, updatedAt: Date.now() });
  } catch (err) {
    logger.error("[zettelkasten-storage] saveArticle failed", err);
    throw err;
  }
}

export async function deleteArticle(id: string): Promise<void> {
  await repoDeleteArticle(id);
}

/**
 * Create placeholder articles for a batch of titles within a subject,
 * skipping any title that already exists (case-insensitive). Read-then-write
 * via SQLite; bulkPutArticles runs in a single SQL transaction.
 */
export async function bulkCreateArticlesIfMissing(
  subjectId: string,
  titles: string[],
  rootSubcategoryId?: string,
): Promise<KnowledgeBaseArticle[]> {
  if (!subjectId || titles.length === 0) return [];

  // Case-insensitive de-dup, preserve original casing of first occurrence + input order.
  const seen = new Map<string, string>();
  for (const raw of titles) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const low = trimmed.toLowerCase();
    if (!seen.has(low)) seen.set(low, trimmed);
  }
  if (seen.size === 0) return [];

  const existing = await repoListBySubject(subjectId);
  const existingTitles = new Set(existing.map(a => a.title.trim().toLowerCase()));

  const toCreate: KnowledgeBaseArticle[] = [];
  for (const [low, original] of seen) {
    if (existingTitles.has(low)) continue;
    toCreate.push(newArticle(subjectId, original, rootSubcategoryId));
    existingTitles.add(low);
  }

  if (toCreate.length > 0) {
    try { await repoBulkPut(toCreate); }
    catch (err) {
      logger.error("[zettelkasten-storage] bulkCreateArticlesIfMissing failed", err);
      throw err;
    }
  }
  return toCreate;
}

export function newArticle(
  subjectId: string,
  title: string,
  rootSubcategoryId?: string
): KnowledgeBaseArticle {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    subjectId,
    title: title.trim() || "Bez naslova",
    contentDoc: { version: 4, content: { type: "doc", content: [] } },
    linkedSourceIds: [],
    rootSubcategoryId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensure a subject has exactly one Index article (entry-point for organic
 * exploration). Read-then-write via SQLite — single-user desktop, race window
 * is benign.
 */
export async function ensureIndexArticle(
  subjectId: string,
  subjectName: string,
  suggestedLinks: readonly string[] = [],
): Promise<KnowledgeBaseArticle> {
  const { htmlToDoc } = await import("@/lib/editor-v4");
  const { mdToHtml } = await import("@/lib/editor-v4/migrate");

  const all = await repoListBySubject(subjectId);

  // 1. Existing Index?
  const existingIndex = all.find(a => a.isIndex === true);
  if (existingIndex) return existingIndex;

  // 2. Promote a same-titled article.
  const normSubject = subjectName.trim().toLowerCase();
  const candidate = all.find(a => a.title.trim().toLowerCase() === normSubject);
  if (candidate) {
    const promoted: KnowledgeBaseArticle = {
      ...candidate,
      isIndex: true,
      updatedAt: Date.now(),
    };
    await repoPutArticle(promoted);
    return promoted;
  }

  // 3. Create a fresh Index with onboarding content.
  const links = suggestedLinks
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const intro = `Dobrodošli u Zettelkasten predmeta **${subjectName.trim()}**. Ovo je Vaša polazna tačka za istraživanje gradiva. Krećite se kroz mrežu znanja klikom na [wiki-linkove] — kada kliknete na link koji još ne postoji, automatski se kreira novi članak.`;

  const body = links.length > 0
    ? `${intro}\n\n## Predložene oblasti za istraživanje\n\n${links.map(l => `- [[${l}]]`).join("\n")}\n\n_Slobodno mijenjajte ovaj članak — Zettelkasten raste organski._`
    : `${intro}\n\n_Počnite kucanjem prvog wiki-linka da kreirate novi članak i započnete mrežu._`;

  const now = Date.now();
  const article: KnowledgeBaseArticle = {
    id: crypto.randomUUID(),
    subjectId,
    title: subjectName.trim() || "Predmet",
    content: body,
    contentDoc: htmlToDoc(mdToHtml(body)),
    linkedSourceIds: [],
    isIndex: true,
    createdAt: now,
    updatedAt: now,
  };
  await repoPutArticle(article);
  return article;
}
