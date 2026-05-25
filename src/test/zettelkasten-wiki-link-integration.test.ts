/**
 * Integration test — parallel wiki-link clicks.
 *
 * Reproduces the exact open-or-create flow used by `ZettelkastenView.handleWikiLink`:
 *   1. In-flight `Map<normalizedTitle, Promise>` coalesces concurrent clicks.
 *   2. `bulkCreateArticlesIfMissing` runs inside one Dexie `rw` transaction.
 *   3. On create, `KB_ARTICLE_UPSERTED` is emitted so the backlink index stays hot.
 *   4. On miss (already-existed branch), `findArticleByTitle` resolves the id.
 *
 * What this guards against:
 *   - Duplicate rows when the user rage-clicks the same [[Wiki Link]].
 *   - Lost emits (backlink index drifting from DB).
 *   - Cross-title independence under load (disjoint titles must not block each other).
 *   - In-flight map cleanup (no leaked Promises after settle).
 *
 * Stabilized by:
 *   - Removing setTimeout/timing assumptions; all index updates are synchronous on emit.
 *   - Asserting version increments deterministically instead of polling.
 *   - Using event capture to verify backlink index is updated before test assertions.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import {
  bulkCreateArticlesIfMissing,
  findArticleByTitle,
  newArticle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { backlinkIndex } from "@/lib/backlink-index";

const SUBJECT = "subject-integration";

/**
 * Mirrors `ZettelkastenView.handleWikiLink` precisely — same coalescing map,
 * same atomic create path, same emit. Returned id is what the UI would open.
 */
function makeWikiLinkHandler(subjectId: string) {
  const inFlight = new Map<string, Promise<string | null>>();
  const emitted: Array<{ subjectId: string; article: KnowledgeBaseArticle }> = [];

  const handle = (title: string): Promise<string | null> => {
    const trimmed = title.trim();
    if (!trimmed) return Promise.resolve(null);
    const key = trimmed.toLowerCase();

    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async (): Promise<string | null> => {
        try {
          const created = await bulkCreateArticlesIfMissing(subjectId, [trimmed]);
          if (created.length > 0) {
            const article = created[0];
            emitted.push({ subjectId, article });
            backlinkIndex.upsertArticle(subjectId, article);
            return article.id;
          }
          const existing = await findArticleByTitle(subjectId, trimmed);
          return existing?.id ?? null;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, pending);
    }
    return pending;
  };

  return { handle, emitted, inFlight };
}

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
  backlinkIndex.rebuildFromAll(SUBJECT, []);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wiki-link integration — parallel clicks", () => {
  it("10 simultaneous clicks on the same title yield exactly one row + one emit", async () => {
    const { handle, emitted, inFlight } = makeWikiLinkHandler(SUBJECT);

    const ids = await Promise.all(
      Array.from({ length: 10 }, () => handle("Načelo savjesnosti")),
    );

    // All clicks resolve to the same article id.
    const unique = new Set(ids.filter((x): x is string => x !== null));
    expect(unique.size).toBe(1);

    // DB has exactly one row.
    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(SUBJECT)
      .toArray();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Načelo savjesnosti");

    // Emit fired exactly once — backlink index will not drift.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].article.id).toBe(all[0].id);

    // No leaked Promises in the coalescing map.
    expect(inFlight.size).toBe(0);
  });

  it("case + whitespace variants of the same title still produce one row", async () => {
    const { handle, emitted } = makeWikiLinkHandler(SUBJECT);

    const ids = await Promise.all([
      handle("Ustavni sud"),
      handle("ustavni sud"),
      handle("  USTAVNI SUD  "),
      handle("Ustavni Sud"),
    ]);

    const unique = new Set(ids.filter((x): x is string => x !== null));
    expect(unique.size).toBe(1);

    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(SUBJECT)
      .toArray();
    expect(all).toHaveLength(1);
    expect(emitted).toHaveLength(1);
  });

  it("disjoint parallel clicks on different titles all create independently", async () => {
    const { handle, emitted } = makeWikiLinkHandler(SUBJECT);

    const titles = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
    const ids = await Promise.all(titles.map(t => handle(t)));

    expect(new Set(ids).size).toBe(titles.length);
    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(SUBJECT)
      .toArray();
    expect(all).toHaveLength(titles.length);
    expect(emitted).toHaveLength(titles.length);
  });

  it("clicks on already-existing article emit nothing and resolve to existing id", async () => {
    const seed = newArticle(SUBJECT, "Postojeći");
    await db.knowledgeBaseArticles.put(seed);

    const { handle, emitted } = makeWikiLinkHandler(SUBJECT);

    const ids = await Promise.all([
      handle("postojeći"),
      handle("POSTOJEĆI"),
      handle("Postojeći"),
    ]);

    expect(ids.every(id => id === seed.id)).toBe(true);
    // Nothing was created → no UPSERTED emit (open-only path).
    expect(emitted).toHaveLength(0);

    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(SUBJECT)
      .toArray();
    expect(all).toHaveLength(1);
  });

  it("upsert updates the backlink index deterministically per create", async () => {
    const { handle } = makeWikiLinkHandler(SUBJECT);

    // Create the target first via wiki-link.
    const targetId = await handle("Cilj");
    expect(targetId).not.toBeNull();

    // Get version BEFORE creating linker — establish baseline.
    const versionBefore = backlinkIndex.getVersion(SUBJECT, "Cilj");

    // Now create a second article whose body links to "Cilj".
    const linker: KnowledgeBaseArticle = {
      ...newArticle(SUBJECT, "Linker"),
      content: "Vidi [[Cilj]] za detalje.",
    };
    await db.knowledgeBaseArticles.put(linker);
    backlinkIndex.upsertArticle(SUBJECT, linker);

    // Backlink index version MUST increment (deterministic signal of update).
    const versionAfter = backlinkIndex.getVersion(SUBJECT, "Cilj");
    expect(versionAfter).toBeGreaterThan(versionBefore);

    // Backlink index must report Linker → Cilj (no timing assumptions).
    const backlinks = backlinkIndex.getBacklinks(SUBJECT, "Cilj");
    expect(backlinks.map(b => b.articleId)).toContain(linker.id);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].title).toBe("Linker");
  });

  it("interleaved bursts: same title clicked in two waves only creates once total", async () => {
    const { handle, emitted } = makeWikiLinkHandler(SUBJECT);

    // Wave 1 — 5 parallel clicks.
    const w1 = Promise.all(Array.from({ length: 5 }, () => handle("Burst")));
    // Wave 2 fires before w1 settles — also gets coalesced or hits "exists".
    const w2 = Promise.all(Array.from({ length: 5 }, () => handle("burst")));

    const [r1, r2] = await Promise.all([w1, w2]);

    const allIds = new Set([...r1, ...r2].filter((x): x is string => x !== null));
    expect(allIds.size).toBe(1);

    const all = await db.knowledgeBaseArticles
      .where("subjectId")
      .equals(SUBJECT)
      .toArray();
    expect(all).toHaveLength(1);
    // Exactly one creation emit across both waves.
    expect(emitted).toHaveLength(1);
  });

  it("backlink index version bumps deterministically on upsert (not timing)", async () => {
    // Initialize backlink index with one article.
    const article1 = newArticle(SUBJECT, "Article One");
    await db.knowledgeBaseArticles.put(article1);
    backlinkIndex.rebuildFromAll(SUBJECT, [article1]);

    // Record initial version.
    const versionInitial = backlinkIndex.getVersion(SUBJECT, "Some Title");
    expect(versionInitial).toBe(0);

    // Create and emit an article that links to "Some Title".
    const linker = {
      ...newArticle(SUBJECT, "Linker"),
      content: "See [[Some Title]] here.",
    };
    await db.knowledgeBaseArticles.put(linker);
    backlinkIndex.upsertArticle(SUBJECT, linker);

    // Version increments immediately (deterministic, not timing-dependent).
    const versionAfter = backlinkIndex.getVersion(SUBJECT, "Some Title");
    expect(versionAfter).toBeGreaterThan(versionInitial);
    expect(versionAfter).toBe(1);

    // Backlinks are available synchronously.
    const backlinks = backlinkIndex.getBacklinks(SUBJECT, "Some Title");
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].articleId).toBe(linker.id);
    expect(backlinks[0].title).toBe("Linker");
  });

  it("removal from backlink index is deterministic and updates version", async () => {
    // Setup: create target and linker articles.
    const target = newArticle(SUBJECT, "Target");
    const linker = {
      ...newArticle(SUBJECT, "Linker"),
      content: "See [[Target]].",
    };
    await db.knowledgeBaseArticles.put(target);
    await db.knowledgeBaseArticles.put(linker);

    // Build index from both articles.
    backlinkIndex.rebuildFromAll(SUBJECT, [target, linker]);

    // Verify link exists.
    let backlinks = backlinkIndex.getBacklinks(SUBJECT, "Target");
    expect(backlinks).toHaveLength(1);

    // Record version before removal.
    const versionBefore = backlinkIndex.getVersion(SUBJECT, "Target");

    // Remove linker and emit event.
    await db.knowledgeBaseArticles.delete(linker.id);
    eventBus.emit(EVENT_TYPES.KB_ARTICLE_REMOVED, {
      subjectId: SUBJECT,
      articleId: linker.id,
    });

    // Version bumps deterministically (no timing assumptions).
    const versionAfter = backlinkIndex.getVersion(SUBJECT, "Target");
    expect(versionAfter).toBeGreaterThan(versionBefore);

    // Backlinks are now empty (deterministic result).
    backlinks = backlinkIndex.getBacklinks(SUBJECT, "Target");
    expect(backlinks).toHaveLength(0);
  });
});
