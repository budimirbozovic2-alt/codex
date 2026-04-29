import { describe, it, expect } from "vitest";
import {
  buildHierarchyOrder,
  compareCardsByHierarchy,
  type HierarchyOrder,
} from "@/lib/card-ordering";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";

function mkCard(partial: Partial<Card> & { id: string }): Card {
  // Minimal viable card — only fields touched by the comparator matter.
  return {
    id: partial.id,
    categoryId: partial.categoryId ?? "cat-1",
    subcategoryId: partial.subcategoryId,
    chapterId: partial.chapterId,
    sortOrder: partial.sortOrder,
    createdAt: partial.createdAt ?? 1000,
    type: "essay",
    question: "q",
    sections: [],
    tags: [],
    // Fields the test doesn't care about — typed as unknown via cast:
  } as unknown as Card;
}

const category: CategoryRecord = {
  id: "cat-1",
  name: "Cat",
  sortOrder: 0,
  subcategories: [
    {
      id: "s1",
      name: "Sub 1",
      sortOrder: 0,
      chapters: [
        { id: "c1a", name: "Ch 1A", sortOrder: 0 },
        { id: "c1b", name: "Ch 1B", sortOrder: 1 },
      ],
    },
    {
      id: "s2",
      name: "Sub 2",
      sortOrder: 1,
      chapters: [
        { id: "c2a", name: "Ch 2A", sortOrder: 0 },
      ],
    },
  ],
} as unknown as CategoryRecord;

describe("hierarchical card ordering", () => {
  const order: HierarchyOrder = buildHierarchyOrder(category);

  it("groups cards by chapter when card.sortOrder collides", () => {
    const a = mkCard({ id: "a", subcategoryId: "s1", chapterId: "c1a", sortOrder: 0 });
    const b = mkCard({ id: "b", subcategoryId: "s1", chapterId: "c1b", sortOrder: 0 });
    const sorted = [b, a].sort((x, y) => compareCardsByHierarchy(x, y, order));
    expect(sorted.map(c => c.id)).toEqual(["a", "b"]);
  });

  it("orders subcategory 1 entirely before subcategory 2", () => {
    const late1 = mkCard({ id: "late1", subcategoryId: "s1", chapterId: "c1b", sortOrder: 99 });
    const early2 = mkCard({ id: "early2", subcategoryId: "s2", chapterId: "c2a", sortOrder: 0 });
    const sorted = [early2, late1].sort((x, y) => compareCardsByHierarchy(x, y, order));
    expect(sorted.map(c => c.id)).toEqual(["late1", "early2"]);
  });

  it("pushes cards without chapterId to the end of their subcategory", () => {
    const orphan = mkCard({ id: "orphan", subcategoryId: "s1", sortOrder: 0 });
    const placed = mkCard({ id: "placed", subcategoryId: "s1", chapterId: "c1b", sortOrder: 0 });
    const sorted = [orphan, placed].sort((x, y) => compareCardsByHierarchy(x, y, order));
    expect(sorted.map(c => c.id)).toEqual(["placed", "orphan"]);
  });

  it("uses card.sortOrder within the same chapter, then createdAt as tie-breaker", () => {
    const a = mkCard({ id: "a", subcategoryId: "s1", chapterId: "c1a", sortOrder: 1, createdAt: 1 });
    const b = mkCard({ id: "b", subcategoryId: "s1", chapterId: "c1a", sortOrder: 0, createdAt: 5 });
    const c = mkCard({ id: "c", subcategoryId: "s1", chapterId: "c1a", sortOrder: 0, createdAt: 3 });
    const sorted = [a, b, c].sort((x, y) => compareCardsByHierarchy(x, y, order));
    expect(sorted.map(c => c.id)).toEqual(["c", "b", "a"]);
  });
});
