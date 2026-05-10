/**
 * Aliases (case-form synonyms) and `[[Target|Display]]` pipe syntax.
 * Verifies backlink resolution + parser contract.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { backlinkIndex } from "@/lib/backlink-index";
import { iterateWikiLinks } from "@/lib/zettelkasten-wiki-link";
import { normalizeAliasList } from "@/lib/zettelkasten-aliases";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

const SUBJECT = "subj-aliases";

function art(id: string, title: string, content = "", aliases?: string[]): KnowledgeBaseArticle {
  return {
    id, subjectId: SUBJECT, title, content,
    linkedSourceIds: [], aliases,
    createdAt: 0, updatedAt: 0,
  };
}

beforeEach(() => backlinkIndex.clear(SUBJECT));

describe("iterateWikiLinks", () => {
  it("parses plain and piped forms", () => {
    const got = Array.from(iterateWikiLinks("Vidi [[A]] i [[B|prikaz]]."));
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ target: "A", display: "A", hasPipe: false });
    expect(got[1]).toMatchObject({ target: "B", display: "prikaz", hasPipe: true });
  });
  it("display half may contain literal pipes", () => {
    const got = Array.from(iterateWikiLinks("[[A|b|c]]"));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ target: "A", display: "b|c", hasPipe: true });
  });
  it("skips empty targets", () => {
    expect(Array.from(iterateWikiLinks("[[ ]] [[|x]]"))).toHaveLength(0);
  });
});

describe("normalizeAliasList", () => {
  it("trims, lowercases, dedupes, and strips invalid entries", () => {
    expect(normalizeAliasList(["  Krivičnog Djela ", "krivičnog djela", "bad|alias", ""]))
      .toEqual(["krivičnog djela"]);
  });
});

describe("backlinkIndex aliases", () => {
  it("alias targets resolve to the canonical article and group under it", () => {
    const articles = [
      art("kd", "Krivično djelo", "", ["krivičnog djela", "krivična djela"]),
      art("a",  "Tema A", "Vidi [[krivičnog djela]] i [[Krivično djelo]]."),
    ];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    // Canonical title bucket should hold one source (a) — both refs collapse.
    const back = backlinkIndex.getBacklinks(SUBJECT, "Krivično djelo");
    expect(back.map(b => b.articleId)).toEqual(["a"]);
    // Resolver returns the canonical article id for any indexed key.
    expect(backlinkIndex.resolveTargetToArticleId(SUBJECT, "krivičnog djela")).toBe("kd");
    expect(backlinkIndex.resolveTargetToArticleId(SUBJECT, "Krivično djelo")).toBe("kd");
    expect(backlinkIndex.resolveTargetToArticleId(SUBJECT, "ne postoji")).toBe(null);
  });

  it("piped form `[[Krivično djelo|krivičnog djela]]` produces a backlink to the canonical", () => {
    const articles = [
      art("kd", "Krivično djelo"),
      art("a", "Tema A", "Pominje se [[Krivično djelo|krivičnog djela]] u članu."),
    ];
    backlinkIndex.rebuildFromAll(SUBJECT, articles);
    const back = backlinkIndex.getBacklinks(SUBJECT, "Krivično djelo");
    expect(back.map(b => b.articleId)).toEqual(["a"]);
  });

  it("removeArticle clears alias keys", () => {
    backlinkIndex.rebuildFromAll(SUBJECT, [art("kd", "Krivično djelo", "", ["krivičnog djela"])]);
    expect(backlinkIndex.resolveTargetToArticleId(SUBJECT, "krivičnog djela")).toBe("kd");
    backlinkIndex.removeArticle(SUBJECT, "kd");
    expect(backlinkIndex.resolveTargetToArticleId(SUBJECT, "krivičnog djela")).toBe(null);
  });
});
