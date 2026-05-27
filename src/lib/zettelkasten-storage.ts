/**
 * Zettelkasten storage façade — PR-9 A1b P1.4.
 *
 * Delegates all DB I/O to `@/lib/db/queries/knowledge-base`. Complex
 * open-or-create transactions (`bulkCreateArticlesIfMissing`,
 * `ensureIndexArticle`) keep their Dexie `rw` transaction for atomic
 * lookup-and-insert semantics, then mirror the freshly created rows into
 * SQLite via `bulkPutArticles` so the SQLite-primary read path sees them on
 * the next query.
 */
import { type KnowledgeBaseArticle, db } from "./db";
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
  // Audit #11: Assume the UI (Editor) has already normalized tags and aliases.
  // We only perform assertive validation here to prevent data corruption.
  if (import.meta.env.DEV) {
    assertTagsNormalized(article.tags);
    assertAliasesNormalized(article.aliases);
  }

  // V6: bubble persistence failures up — caller decides whether to surface a
  // toast and skip the optimistic UI update. No silent swallow.
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
 * Atomically create placeholder articles for a batch of titles within a subject,
 * skipping any title that already exists (case-insensitive). The Dexie `rw`
 * transaction guarantees the lookup-and-insert is atomic; the post-commit
 * mirror writes the new rows into SQLite in a single transaction.
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

  const created = await db.transaction("rw", db.knowledgeBaseArticles, async () => {
    // Single indexed range scan over the subject (uses `subjectId` index),
    // O(N_subject) once per batch instead of O(N_subject * titles.length).
    const existingTitles = new Set<string>();
    await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(subjectId)
      .each(a => existingTitles.add(a.title.trim().toLowerCase()));

    const toCreate: KnowledgeBaseArticle[] = [];
    for (const [low, original] of seen) {
      if (existingTitles.has(low)) continue;
      toCreate.push(newArticle(subjectId, original, rootSubcategoryId));
      existingTitles.add(low);
    }

    if (toCreate.length > 0) {
      await db.knowledgeBaseArticles.bulkPut(toCreate);
    }
    return toCreate;
  });

  // Mirror the freshly created rows into SQLite. Dexie already has them.
  if (created.length > 0) {
    try { await repoBulkPut(created); }
    catch (err) {
      logger.warn("[zettelkasten-storage] sqlite mirror after bulkCreate failed", err);
    }
  }
  return created;
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
 * exploration). Atomic open-or-create within a single Dexie `rw` transaction;
 * any write side-effect is mirrored to SQLite afterwards.
 */
export async function ensureIndexArticle(
  subjectId: string,
  subjectName: string,
  suggestedLinks: readonly string[] = [],
): Promise<KnowledgeBaseArticle> {
  // PR-7b: hoist dynamic imports OUT of the Dexie transaction.
  const { htmlToDoc } = await import("@/lib/editor-v4");
  const { mdToHtml } = await import("@/lib/editor-v4/migrate");

  let mirrorTarget: KnowledgeBaseArticle | null = null;

  const result = await db.transaction("rw", db.knowledgeBaseArticles, async () => {
    // 1. Existing Index?
    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(subjectId)
      .toArray();

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
      await db.knowledgeBaseArticles.put(promoted);
      mirrorTarget = promoted;
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
    await db.knowledgeBaseArticles.put(article);
    mirrorTarget = article;
    return article;
  });

  if (mirrorTarget) {
    try { await repoBulkPut([mirrorTarget]); }
    catch (err) {
      logger.warn("[zettelkasten-storage] sqlite mirror after ensureIndex failed", err);
    }
  }
  return result;
}
