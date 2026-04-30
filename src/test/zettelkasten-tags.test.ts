import { describe, expect, it } from "vitest";
import {
  normalizeTag,
  normalizeTagList,
  getTagCounts,
  filterByActiveTags,
  TAG_LIMITS,
} from "@/lib/zettelkasten-tags";

describe("normalizeTag", () => {
  it("strips leading # and lowercases", () => {
    expect(normalizeTag("#Načelo")).toBe("načelo");
    expect(normalizeTag("##  Načelo  ")).toBe("načelo");
  });

  it("collapses internal whitespace to a hyphen", () => {
    expect(normalizeTag("Ljudska Prava")).toBe("ljudska-prava");
    expect(normalizeTag("  vrlo   dugačko   ime  ")).toBe("vrlo-dugačko-ime");
  });

  it("drops punctuation but keeps diacritics, digits, hyphen, underscore", () => {
    expect(normalizeTag("član. 5/3")).toBe("član-53");
    expect(normalizeTag("test_one-two")).toBe("test_one-two");
    expect(normalizeTag("Šta?!")).toBe("šta");
  });

  it("returns empty string for empty/whitespace-only input", () => {
    expect(normalizeTag("")).toBe("");
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("#")).toBe("");
  });

  it("caps at 32 characters", () => {
    const long = "a".repeat(50);
    const out = normalizeTag(long);
    expect(out.length).toBe(TAG_LIMITS.maxTagLength);
  });
});

describe("normalizeTagList", () => {
  it("dedupes preserving first-occurrence order", () => {
    expect(normalizeTagList(["#A", "b", "a", "B", "c"])).toEqual(["a", "b", "c"]);
  });

  it("drops empty results", () => {
    expect(normalizeTagList(["", "  ", "#", "real"])).toEqual(["real"]);
  });

  it("caps at MAX_TAGS_PER_ARTICLE", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    const out = normalizeTagList(many);
    expect(out.length).toBe(TAG_LIMITS.maxPerArticle);
    expect(out[0]).toBe("tag-0");
    expect(out[TAG_LIMITS.maxPerArticle - 1]).toBe(`tag-${TAG_LIMITS.maxPerArticle - 1}`);
  });

  it("handles undefined and empty inputs", () => {
    expect(normalizeTagList(undefined)).toEqual([]);
    expect(normalizeTagList([])).toEqual([]);
  });
});

describe("getTagCounts", () => {
  it("aggregates and sorts by count desc, then alpha", () => {
    const articles = [
      { tags: ["pravo", "ustav"] },
      { tags: ["pravo"] },
      { tags: ["ustav", "norma"] },
      { tags: ["pravo", "norma"] },
    ];
    const counts = getTagCounts(articles);
    expect(counts).toEqual([
      { tag: "pravo", count: 3 },
      { tag: "norma", count: 2 },
      { tag: "ustav", count: 2 },
    ]);
  });

  it("ignores articles without tags", () => {
    expect(getTagCounts([{}, { tags: undefined }, { tags: [] }])).toEqual([]);
  });

  it("dedupes within a single article (defensive against stale data)", () => {
    const counts = getTagCounts([{ tags: ["X", "x", "#X"] }]);
    expect(counts).toEqual([{ tag: "x", count: 1 }]);
  });

  it("re-normalizes stale tag inputs before counting", () => {
    const counts = getTagCounts([{ tags: ["#Načelo"] }, { tags: ["NAČELO"] }]);
    expect(counts).toEqual([{ tag: "načelo", count: 2 }]);
  });
});

describe("filterByActiveTags", () => {
  const articles = [
    { id: "a", tags: ["pravo", "ustav"] },
    { id: "b", tags: ["pravo"] },
    { id: "c", tags: ["norma"] },
    { id: "d", tags: [] },
    { id: "e" },
  ];

  it("returns all articles unchanged when activeTags is empty", () => {
    const out = filterByActiveTags(articles, new Set());
    expect(out).toHaveLength(articles.length);
    expect(out.map(a => a.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("uses OR semantics — match any active tag", () => {
    const out = filterByActiveTags(articles, new Set(["pravo", "norma"]));
    expect(out.map(a => a.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("never matches articles without tags", () => {
    const out = filterByActiveTags(articles, new Set(["pravo"]));
    expect(out.map(a => a.id).includes("d")).toBe(false);
    expect(out.map(a => a.id).includes("e")).toBe(false);
  });

  it("matches against re-normalized stale tags", () => {
    const stale = [{ id: "x", tags: ["#Načelo"] }];
    const out = filterByActiveTags(stale, new Set(["načelo"]));
    expect(out).toHaveLength(1);
  });

  it("returns a fresh array (no aliasing of input)", () => {
    const out = filterByActiveTags(articles, new Set());
    expect(out).not.toBe(articles);
  });
});
