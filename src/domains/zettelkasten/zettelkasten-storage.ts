/**
 * Zettelkasten storage façade — SQLite-primary (A1c-4 F6.3).
 * SQLite-only: all reads and writes delegate to knowledge-base.
 *
 * PR-H7 Hardening: Fully wrapped signatures and string literals
 * to strictly enforce the Safe-Paste constraint.
 */
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { assertTagsNormalized } from "@/lib/zettelkasten-tags";
import { assertAliasesNormalized } from "@/lib/zettelkasten-aliases";
import {
  getArticle as repoGetArticle,
  listArticlesBySubject as repoListBySubject,
  findArticleByTitle as repoFindByTitle,
  getIndexArticle as repoGetIndexArticle,
  putArticle as repoPutArticle,
  bulkPutArticles as repoBulkPut,
  deleteArticle as repoDeleteArticle,
} from "@/lib/db/queries/knowledge-base";
import { logger } from "@/lib/logger";

export type { KnowledgeBaseArticle };

const _subjectLocks = new Map<string, Promise<unknown>>();

async function withSubjectLock<T>(
  subjectId: string, 
  fn: () => Promise<T>
): Promise<T> {
  const prev = _subjectLocks.get(subjectId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const chained = prev.then(() => next);
  _subjectLocks.set(subjectId, chained);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (_subjectLocks.get(subjectId) === chained) {
      _subjectLocks.delete(subjectId);
    }
  }
}

export async function loadArticlesBySubject(
  subjectId: string
): Promise<KnowledgeBaseArticle[]> {
  return repoListBySubject(subjectId);
}

export async function getArticle(
  id: string
): Promise<KnowledgeBaseArticle | undefined> {
  return repoGetArticle(id);
}

export async function findArticleByTitle(
  subjectId: string,
  title: string
): Promise<KnowledgeBaseArticle | undefined> {
  return repoFindByTitle(subjectId, title);
}

export async function saveArticle(
  article: KnowledgeBaseArticle
): Promise<void> {
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

export async function bulkCreateArticlesIfMissing(
  subjectId: string,
  titles: string[],
  rootSubcategoryId?: string,
): Promise<KnowledgeBaseArticle[]> {
  if (!subjectId || titles.length === 0) return [];

  const seen = new Map<string, string>();
  for (const raw of titles) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const low = trimmed.toLowerCase();
    if (!seen.has(low)) seen.set(low, trimmed);
  }
  if (seen.size === 0) return [];

  return withSubjectLock(subjectId, async () => {
    const existing = await repoListBySubject(subjectId);
    const existingTitles = new Set(
      existing.map(a => a.title.trim().toLowerCase())
    );

    const toCreate: KnowledgeBaseArticle[] = [];
    for (const [low, original] of seen) {
      if (existingTitles.has(low)) continue;
      toCreate.push(
        newArticle(subjectId, original, rootSubcategoryId)
      );
      existingTitles.add(low);
    }

    if (toCreate.length > 0) {
      try { 
        await repoBulkPut(toCreate); 
      } catch (err) {
        logger.error("[zettelkasten-storage] bulk failed", err);
        throw err;
      }
    }
    return toCreate;
  });
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
    contentDoc: { 
      version: 4, 
      content: { type: "doc", content: [] } 
    },
    linkedSourceIds: [],
    rootSubcategoryId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureIndexArticle(
  subjectId: string,
  subjectName: string,
  suggestedLinks: readonly string[] = [],
): Promise<KnowledgeBaseArticle> {
  const { htmlToDoc } = await import("@/lib/editor-v4");
  const { mdToHtml } = await import("@/lib/editor-v4/migrate");

  return withSubjectLock(subjectId, async () => {
    const existingIndex = await repoGetIndexArticle(subjectId);
    if (existingIndex) return existingIndex;

    const all = await repoListBySubject(subjectId);

    const normSubject = subjectName.trim().toLowerCase();
    const candidate = all.find(
      a => a.title.trim().toLowerCase() === normSubject
    );
    if (candidate) {
      const promoted: KnowledgeBaseArticle = {
        ...candidate,
        isIndex: true,
        updatedAt: Date.now(),
      };
      await repoPutArticle(promoted);
      return promoted;
    }

    const links = suggestedLinks
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 8);

    const intro = "Dobrodošli u Zettelkasten predmeta **" +
      subjectName.trim() + "**. Ovo je Vaša polazna tačka " +
      "za istraživanje gradiva. Krećite se kroz mrežu " +
      "znanja klikom na [wiki-linkove] — kada kliknete na " +
      "link koji još ne postoji, automatski se kreira " +
      "novi članak.";

    const body = links.length > 0
      ? intro + "\n\n## Predložene oblasti za " +
        "istraživanje\n\n" +
        links.map(l => `- [[${l}]]`).join("\n") +
        "\n\n_Slobodno mijenjajte ovaj članak — " +
        "Zettelkasten raste organski._"
      : intro + "\n\n_Počnite kucanjem prvog wiki-linka " +
        "da kreirate novi članak i započnete mrežu._";

    const now = Date.now();
    const article: KnowledgeBaseArticle = {
      id: crypto.randomUUID(),
      subjectId,
      title: subjectName.trim() || "Predmet",
      contentDoc: htmlToDoc(mdToHtml(body)),
      linkedSourceIds: [],
      isIndex: true,
      createdAt: now,
      updatedAt: now,
    };
    await repoPutArticle(article);
    return article;
  });
}