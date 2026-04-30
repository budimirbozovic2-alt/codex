/**
 * Contract for the count + orphan helpers added to `backlinkIndex`.
 * Index is built in-memory from a synthetic article list — no DB needed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { backlinkIndex } from "@/lib/backlink-index";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

const SUBJECT = "subj-counts";

function art(id: string, title: string, content = "", isIndex = false): KnowledgeBaseArticle {
  return {
    id,
    subjectId: SUBJECT,
    title,
    content,
    linkedSourceIds: [],
    isIndex,
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  backlinkIndex.clear(SUBJECT);
});

describe("backlinkIndex.getCountsByArticle", () => {
  it("counts incoming wiki-link references per article", () => {
    const articles = [
      art("idx", "Ustavno pravo", "See [[Ljudska prava]] and [[Organi vlasti]].", true),
      art("a", "Ljudska prava", "Refer to [[Organi vlasti]]."),
      art("b", "Organi vlasti", ""),
      art("c", "Sirota tema", ""),
    ];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const counts = backlinkIndex.getCountsByArticle(SUBJECT, articles);

    expect(counts.get("a")).toBe(1);  // referenced by idx
    expect(counts.get("b")).toBe(2);  // referenced by idx + a
    expect(counts.has("c")).toBe(false); // never referenced → absent
    expect(counts.has("idx")).toBe(false); // index has no incoming refs
  });

  it("returns empty map when subject has no index built yet", () => {
    const counts = backlinkIndex.getCountsByArticle("never-built", []);
    expect(counts.size).toBe(0);
  });

  it("ignores self-references", () => {
    const articles = [art("self", "Self", "I link to [[Self]] but it shouldn't count.")];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const counts = backlinkIndex.getCountsByArticle(SUBJECT, articles);
    expect(counts.has("self")).toBe(false);
  });

  it("is case-insensitive on titles", () => {
    const articles = [
      art("a", "Načelo", "Pominje se u [[NAČELO]] u drugom kontekstu — wait that's self."),
      art("b", "Drugo", "Vidi [[načelo]] i [[NAČELO]]."),
    ];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const counts = backlinkIndex.getCountsByArticle(SUBJECT, articles);
    // 'b' references "načelo" (de-duped per source) → counts to 1 inbound for 'a'.
    expect(counts.get("a")).toBe(1);
  });
});

describe("backlinkIndex.getOrphans", () => {
  it("returns non-Index articles with zero incoming links", () => {
    const articles = [
      art("idx", "Predmet", "[[Tema 1]]", true),
      art("t1", "Tema 1", ""),
      art("t2", "Tema 2", ""),       // orphan
      art("t3", "Tema 3", "[[Tema 2]]"),
    ];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const orphans = backlinkIndex.getOrphans(SUBJECT, articles);
    const ids = orphans.map(a => a.id).sort();
    // t1 referenced by idx, t2 referenced by t3 → only t3 is orphan; idx excluded.
    expect(ids).toEqual(["t3"]);
  });

  it("never returns the Index article even if unreferenced", () => {
    const articles = [art("idx", "Predmet", "", true), art("a", "A", "")];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const orphans = backlinkIndex.getOrphans(SUBJECT, articles);
    expect(orphans.find(a => a.isIndex)).toBeUndefined();
    expect(orphans.map(a => a.id)).toContain("a");
  });
});
