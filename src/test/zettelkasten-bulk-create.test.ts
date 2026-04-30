/**
 * Concurrency + atomicity contract for `bulkCreateArticlesIfMissing`.
 *
 * Runs against a real Dexie instance backed by `fake-indexeddb`, so it
 * exercises the actual `rw` transaction semantics — not a mock.
 *
 * Guarantees verified:
 *  1. Case-insensitive skip of pre-existing titles + in-batch dedup.
 *  2. All-existing input ⇒ no write, returns [].
 *  3. Subject scoping — same title in another subject is independent.
 *  4. Two overlapping concurrent calls produce no duplicate row.
 *  5. Hot race: N parallel calls for the same title ⇒ exactly one row.
 *  6. Disjoint parallel batches all succeed independently.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  bulkCreateArticlesIfMissing,
  loadArticlesBySubject,
  newArticle,
} from "@/lib/zettelkasten-storage";

const SUBJECT_A = "subject-a";
const SUBJECT_B = "subject-b";

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});

describe("bulkCreateArticlesIfMissing — atomicity & dedup", () => {
  it("creates one article per unique title and skips pre-existing (case-insensitive)", async () => {
    await db.knowledgeBaseArticles.put(newArticle(SUBJECT_A, "Ustav"));

    const created = await bulkCreateArticlesIfMissing(SUBJECT_A, [
      "ustav",        // existing, different case
      "USTAV ",       // existing, padded + case
      "Zakon",        // new
      "  zakon  ",    // dup of new within batch
      "",             // ignored
    ]);

    expect(created.map(a => a.title)).toEqual(["Zakon"]);

    const all = await loadArticlesBySubject(SUBJECT_A);
    expect(all).toHaveLength(2);
    const titlesLower = all.map(a => a.title.toLowerCase()).sort();
    expect(titlesLower).toEqual(["ustav", "zakon"]);
  });

  it("returns empty + writes nothing when every title already exists", async () => {
    await db.knowledgeBaseArticles.bulkPut([
      newArticle(SUBJECT_A, "Alpha"),
      newArticle(SUBJECT_A, "Beta"),
    ]);

    const created = await bulkCreateArticlesIfMissing(SUBJECT_A, ["alpha", "BETA"]);
    expect(created).toEqual([]);

    const all = await loadArticlesBySubject(SUBJECT_A);
    expect(all).toHaveLength(2);
  });

  it("scopes by subjectId — same title in another subject is not a conflict", async () => {
    await db.knowledgeBaseArticles.put(newArticle(SUBJECT_B, "Ustav"));

    const created = await bulkCreateArticlesIfMissing(SUBJECT_A, ["Ustav"]);
    expect(created).toHaveLength(1);
    expect(created[0].subjectId).toBe(SUBJECT_A);

    const aArticles = await loadArticlesBySubject(SUBJECT_A);
    const bArticles = await loadArticlesBySubject(SUBJECT_B);
    expect(aArticles).toHaveLength(1);
    expect(bArticles).toHaveLength(1);
  });
});

describe("bulkCreateArticlesIfMissing — concurrent calls", () => {
  it("two overlapping concurrent calls produce no duplicates (tx serialisation)", async () => {
    const [r1, r2] = await Promise.all([
      bulkCreateArticlesIfMissing(SUBJECT_A, ["Shared", "OnlyOne"]),
      bulkCreateArticlesIfMissing(SUBJECT_A, ["shared", "OnlyTwo"]), // case-variant overlap
    ]);

    const all = await loadArticlesBySubject(SUBJECT_A);
    const titlesLower = all.map(a => a.title.toLowerCase()).sort();

    // Exactly the union — Shared (once), OnlyOne, OnlyTwo.
    expect(titlesLower).toEqual(["onlyone", "onlytwo", "shared"]);

    // Across both result arrays we must see exactly 3 created rows total,
    // and only one of them may claim "shared".
    const totalCreated = r1.length + r2.length;
    expect(totalCreated).toBe(3);

    const sharedClaims = [...r1, ...r2].filter(
      a => a.title.toLowerCase() === "shared",
    );
    expect(sharedClaims).toHaveLength(1);
  });

  it("many parallel calls with the same title still create exactly one row", async () => {
    const N = 10;
    const calls = Array.from({ length: N }, () =>
      bulkCreateArticlesIfMissing(SUBJECT_A, ["Race"]),
    );
    const results = await Promise.all(calls);

    const all = await loadArticlesBySubject(SUBJECT_A);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Race");

    const totalCreated = results.reduce((n, r) => n + r.length, 0);
    expect(totalCreated).toBe(1);
  });

  it("disjoint concurrent batches all succeed independently", async () => {
    const [r1, r2, r3] = await Promise.all([
      bulkCreateArticlesIfMissing(SUBJECT_A, ["A1", "A2"]),
      bulkCreateArticlesIfMissing(SUBJECT_A, ["B1", "B2"]),
      bulkCreateArticlesIfMissing(SUBJECT_A, ["C1"]),
    ]);

    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(2);
    expect(r3).toHaveLength(1);

    const all = await loadArticlesBySubject(SUBJECT_A);
    expect(all).toHaveLength(5);
  });
});
