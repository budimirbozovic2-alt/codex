import { describe, it, expect } from "vitest";
import { buildCardBuckets, compositeKey, EMPTY_BUCKETS, getByCategory } from "@/lib/card-buckets";
import type { Card } from "@/lib/spaced-repetition";

const mk = (over: Partial<Card>): Card => ({
  id: over.id ?? "x",
  categoryId: over.categoryId ?? "",
  subcategoryId: over.subcategoryId,
  chapterId: over.chapterId,
  question: "", sections: [], type: "essay" as Card["type"],
  createdAt: over.createdAt ?? 0, sortOrder: over.sortOrder ?? 0,
  ...over,
} as Card);

describe("card-buckets", () => {
  const cards = [
    mk({ id: "c1", categoryId: "catA", subcategoryId: "sA1", chapterId: "ch1" }),
    mk({ id: "c2", categoryId: "catA", subcategoryId: "sA1", chapterId: "ch2" }),
    mk({ id: "c3", categoryId: "catA", subcategoryId: "sA2", chapterId: "ch3" }),
    mk({ id: "c4", categoryId: "catB", subcategoryId: "sB1", chapterId: "ch1" }), // chapter UUID collision across cats
    mk({ id: "c5", categoryId: "catB" }),                                           // no sub, no chap
    mk({ id: "c6", categoryId: "catA", subcategoryId: "sA1" }),                     // no chap
  ];
  const b = buildCardBuckets(cards);

  it("byCategory groups all cards under each category", () => {
    expect(b.byCategory.get("catA")?.map(c => c.id)).toEqual(["c1", "c2", "c3", "c6"]);
    expect(b.byCategory.get("catB")?.map(c => c.id)).toEqual(["c4", "c5"]);
  });

  it("bySubcategory only includes cards with subcategoryId", () => {
    expect(b.bySubcategory.get("sA1")?.map(c => c.id)).toEqual(["c1", "c2", "c6"]);
    expect(b.bySubcategory.get("sA2")?.map(c => c.id)).toEqual(["c3"]);
    expect(b.bySubcategory.has("__none__")).toBe(false);
  });

  it("byChapter only includes cards with chapterId", () => {
    expect(b.byChapter.get("ch1")?.map(c => c.id)).toEqual(["c1", "c4"]);
    expect(b.byChapter.get("ch2")?.map(c => c.id)).toEqual(["c2"]);
  });

  it("byCategoryChapter disambiguates same chapter id across categories", () => {
    expect(b.byCategoryChapter.get(compositeKey("catA", "ch1"))?.map(c => c.id)).toEqual(["c1"]);
    expect(b.byCategoryChapter.get(compositeKey("catB", "ch1"))?.map(c => c.id)).toEqual(["c4"]);
  });

  it("bySubcategoryChapter is keyed by sub+chap pair", () => {
    expect(b.bySubcategoryChapter.get(compositeKey("sA1", "ch1"))?.map(c => c.id)).toEqual(["c1"]);
    expect(b.bySubcategoryChapter.get(compositeKey("sA1", "ch2"))?.map(c => c.id)).toEqual(["c2"]);
  });

  it("getByCategory returns [] for missing/falsy ids", () => {
    expect(getByCategory(b, null)).toEqual([]);
    expect(getByCategory(b, "missing")).toEqual([]);
    expect(getByCategory(b, "catA")).toHaveLength(4);
  });

  it("EMPTY_BUCKETS works as a safe default", () => {
    expect(EMPTY_BUCKETS.byCategory.get("anything")).toBeUndefined();
    expect(getByCategory(EMPTY_BUCKETS, "x")).toEqual([]);
  });
});
