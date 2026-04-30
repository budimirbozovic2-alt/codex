/**
 * Contract: per-subject backlink index produces O(1) lookups, scopes correctly,
 * handles incremental upsert/remove, and survives renames + self-references.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { backlinkIndex } from "@/lib/backlink-index";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

const SUBJ = "subj-X";
const SUBJ2 = "subj-Y";

function art(id: string, title: string, content: string, subj = SUBJ): KnowledgeBaseArticle {
  return {
    id,
    subjectId: subj,
    title,
    content,
    linkedSourceIds: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  backlinkIndex.clear(SUBJ);
  backlinkIndex.clear(SUBJ2);
});

describe("backlinkIndex.rebuildFromAll", () => {
  it("indexes a basic [[wiki link]] reference", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [
      art("a", "Source", "Pogledaj [[Target]] ovdje."),
      art("b", "Target", "Sadržaj cilja."),
    ]);
    const r = backlinkIndex.getBacklinks(SUBJ, "Target", "b");
    expect(r).toHaveLength(1);
    expect(r[0].articleId).toBe("a");
    expect(r[0].snippet).toContain("Target");
  });

  it("is case- and whitespace-insensitive", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "S", "x [[  TARGET  ]] y")]);
    expect(backlinkIndex.getBacklinks(SUBJ, "target")).toHaveLength(1);
  });

  it("excludes self-references", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "Target", "Ja sam [[Target]].")]);
    expect(backlinkIndex.getBacklinks(SUBJ, "Target", "a")).toHaveLength(0);
  });

  it("scopes per subject", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "S", "[[T]]", SUBJ)]);
    backlinkIndex.rebuildFromAll(SUBJ2, [art("b", "S2", "no link", SUBJ2)]);
    expect(backlinkIndex.getBacklinks(SUBJ, "T")).toHaveLength(1);
    expect(backlinkIndex.getBacklinks(SUBJ2, "T")).toHaveLength(0);
  });
});

describe("backlinkIndex.upsertArticle", () => {
  it("removes stale links when content drops them", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "S", "[[T]]")]);
    expect(backlinkIndex.getBacklinks(SUBJ, "T")).toHaveLength(1);
    backlinkIndex.upsertArticle(SUBJ, art("a", "S", "no more links"));
    expect(backlinkIndex.getBacklinks(SUBJ, "T")).toHaveLength(0);
  });

  it("adds new links incrementally", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "S", "no links")]);
    backlinkIndex.upsertArticle(SUBJ, art("a", "S", "now has [[NewTarget]]"));
    const r = backlinkIndex.getBacklinks(SUBJ, "NewTarget");
    expect(r).toHaveLength(1);
    expect(r[0].articleId).toBe("a");
  });

  it("dedupes repeated [[X]] within same article", () => {
    backlinkIndex.upsertArticle(SUBJ, art("a", "S", "[[X]] and [[X]] and [[x]]"));
    expect(backlinkIndex.getBacklinks(SUBJ, "X")).toHaveLength(1);
  });
});

describe("backlinkIndex.removeArticle", () => {
  it("drops the article from every target bucket", () => {
    backlinkIndex.rebuildFromAll(SUBJ, [art("a", "S", "[[T1]] and [[T2]]")]);
    backlinkIndex.removeArticle(SUBJ, "a");
    expect(backlinkIndex.getBacklinks(SUBJ, "T1")).toHaveLength(0);
    expect(backlinkIndex.getBacklinks(SUBJ, "T2")).toHaveLength(0);
  });
});

describe("backlinkIndex subscribe + version", () => {
  it("notifies subscribers on relevant upsert", () => {
    let calls = 0;
    const off = backlinkIndex.subscribe(SUBJ, "T", () => calls++);
    backlinkIndex.upsertArticle(SUBJ, art("a", "S", "[[T]]"));
    expect(calls).toBeGreaterThanOrEqual(1);
    off();
  });

  it("does not notify for unrelated targets", () => {
    let calls = 0;
    const off = backlinkIndex.subscribe(SUBJ, "Other", () => calls++);
    backlinkIndex.upsertArticle(SUBJ, art("a", "S", "[[T]]"));
    expect(calls).toBe(0);
    off();
  });
});

describe("performance characteristic", () => {
  it("O(1) lookup remains snappy at 1k articles", () => {
    const arts: KnowledgeBaseArticle[] = [];
    for (let i = 0; i < 1000; i++) {
      arts.push(art(`a${i}`, `Article ${i}`, i % 10 === 0 ? "[[Target]] body" : "no links"));
    }
    backlinkIndex.rebuildFromAll(SUBJ, arts);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) backlinkIndex.getBacklinks(SUBJ, "Target");
    const dt = performance.now() - t0;
    // 1k lookups should complete in well under 200ms even on the slowest CI.
    expect(dt).toBeLessThan(200);
    expect(backlinkIndex.getBacklinks(SUBJ, "Target")).toHaveLength(100);
  });
});
