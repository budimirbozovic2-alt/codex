import { db, type KnowledgeBaseArticle } from "./db";

export type { KnowledgeBaseArticle };

export async function loadArticlesBySubject(subjectId: string): Promise<KnowledgeBaseArticle[]> {
  const all = await db.knowledgeBaseArticles.where("subjectId").equals(subjectId).toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getArticle(id: string): Promise<KnowledgeBaseArticle | undefined> {
  return db.knowledgeBaseArticles.get(id);
}

/** Case-insensitive title lookup within a subject. Used to resolve [[wiki-links]].
 *  Fast path: uses the [subjectId+title] compound index for an exact (trimmed) match.
 *  Slow path: falls back to a filtered, short-circuiting scan for case-insensitive match. */
export async function findArticleByTitle(
  subjectId: string,
  title: string
): Promise<KnowledgeBaseArticle | undefined> {
  const trimmed = title.trim();
  if (!trimmed) return undefined;

  // Fast path — O(log N) compound index hit for exact case match.
  const exact = await db.knowledgeBaseArticles
    .where("[subjectId+title]")
    .equals([subjectId, trimmed])
    .first();
  if (exact) return exact;

  // Slow path — short-circuits on the first case-insensitive match,
  // avoiding loading the entire subject's articles into memory.
  const normalized = trimmed.toLowerCase();
  return db.knowledgeBaseArticles
    .where("subjectId")
    .equals(subjectId)
    .filter(a => a.title.trim().toLowerCase() === normalized)
    .first();
}

export async function saveArticle(article: KnowledgeBaseArticle): Promise<void> {
  await db.knowledgeBaseArticles.put({ ...article, updatedAt: Date.now() });
}

export async function deleteArticle(id: string): Promise<void> {
  await db.knowledgeBaseArticles.delete(id);
}

/**
 * Atomically create placeholder articles for a batch of titles within a subject,
 * skipping any title that already exists (case-insensitive). Runs the entire
 * lookup + insert pass inside a single `rw` Dexie transaction with `bulkPut`,
 * eliminating per-title round-trips during wiki-link auto-creation while typing.
 *
 * Returns the freshly created articles (in input order, deduped case-insensitively).
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

  return db.transaction("rw", db.knowledgeBaseArticles, async () => {
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
      // Guard against duplicates within the same batch.
      existingTitles.add(low);
    }

    if (toCreate.length > 0) {
      await db.knowledgeBaseArticles.bulkPut(toCreate);
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
    content: "",
    linkedSourceIds: [],
    rootSubcategoryId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensure a subject has exactly one Index article (entry-point for organic
 * exploration). Atomic open-or-create within a single Dexie `rw` transaction:
 *
 * 1. If an article with `isIndex=true` already exists for the subject → return it.
 * 2. Else, if a regular article whose title (case-insensitive, trimmed) matches
 *    `subjectName` exists → promote it to Index (set `isIndex=true`).
 * 3. Else → create a new Index article seeded with an onboarding markdown body.
 *    When `suggestedLinks` are provided, they appear as `[[wiki-links]]` so the
 *    user can immediately start branching out.
 *
 * Multiple concurrent callers race-safely: only one Index can exist per subject.
 */
export async function ensureIndexArticle(
  subjectId: string,
  subjectName: string,
  suggestedLinks: readonly string[] = [],
): Promise<KnowledgeBaseArticle> {
  return db.transaction("rw", db.knowledgeBaseArticles, async () => {
    // 1. Existing Index?
    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(subjectId)
      .toArray();

    const existingIndex = all.find(a => a.isIndex === true);
    if (existingIndex) return existingIndex;

    // 2. Promote a same-titled article (migration path for pre-existing data).
    const normSubject = subjectName.trim().toLowerCase();
    const candidate = all.find(a => a.title.trim().toLowerCase() === normSubject);
    if (candidate) {
      const promoted: KnowledgeBaseArticle = {
        ...candidate,
        isIndex: true,
        updatedAt: Date.now(),
      };
      await db.knowledgeBaseArticles.put(promoted);
      return promoted;
    }

    // 3. Create a fresh Index with onboarding content.
    const links = suggestedLinks
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 8);

    const intro = `Dobrodošli u Zettelkasten predmeta **${subjectName.trim()}**. Ovo je Vaša polazna tačka za istraživanje gradiva. Krećite se kroz mrežu znanja klikom na \`[[wiki-linkove]]\` — kada kliknete na link koji još ne postoji, automatski se kreira novi članak.`;

    const body = links.length > 0
      ? `${intro}\n\n## Predložene oblasti za istraživanje\n\n${links.map(l => `- [[${l}]]`).join("\n")}\n\n_Slobodno mijenjajte ovaj članak — Zettelkasten raste organski._`
      : `${intro}\n\n_Počnite kucanjem prvog \`[[wiki-linka]]\` da kreirate novi članak i započnete mrežu._`;

    const now = Date.now();
    const article: KnowledgeBaseArticle = {
      id: crypto.randomUUID(),
      subjectId,
      title: subjectName.trim() || "Predmet",
      content: body,
      linkedSourceIds: [],
      isIndex: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.knowledgeBaseArticles.put(article);
    return article;
  });
}
