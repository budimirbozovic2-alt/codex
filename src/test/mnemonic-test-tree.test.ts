import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  buildHookTypeCounts,
  buildUuidToName,
  filterTestable,
} from "@/features/mnemonic";
import type { MnemonicCard, HookType } from "@/features/mnemonic";
import type { CategoryRecord } from "@/lib/db-schema";

function card(id: string, categoryId: string, subcategoryId: string | undefined, hookType: HookType): MnemonicCard {
  return {
    id,
    originalCardId: "orig-" + id,
    question: "q?",
    sections: [],
    categoryId,
    subcategoryId,
    hookType,
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "ready",
    createdAt: 0,
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

describe("test-tree", () => {
  const cards: MnemonicCard[] = [
    card("1", "catA", "subA1", "rokovi"),
    card("2", "catA", "subA1", "nabrajanja"),
    card("3", "catA", "subA2", "rokovi"),
    card("4", "catB", undefined, "ostalo"),
    card("5", "catB", "subB1", "rokovi"),
  ];

  it("buildCategoryTree groups subcategories per category", () => {
    const tree = buildCategoryTree(cards);
    expect([...tree.catA].sort()).toEqual(["subA1", "subA2"]);
    expect([...tree.catB]).toEqual(["subB1"]);
  });

  it("buildHookTypeCounts tallies all hook types including zero", () => {
    expect(buildHookTypeCounts(cards)).toEqual({ rokovi: 3, nabrajanja: 1, ostalo: 1 });
    expect(buildHookTypeCounts([])).toEqual({ rokovi: 0, nabrajanja: 0, ostalo: 0 });
  });

  it("filterTestable composes category + sub + hookType narrowing", () => {
    expect(filterTestable(cards, { category: null, subcategory: null, hookType: null })).toHaveLength(5);
    expect(filterTestable(cards, { category: "catA", subcategory: null, hookType: null })).toHaveLength(3);
    expect(filterTestable(cards, { category: "catA", subcategory: "subA1", hookType: null })).toHaveLength(2);
    expect(filterTestable(cards, { category: "catA", subcategory: null, hookType: "rokovi" })).toHaveLength(2);
    expect(filterTestable(cards, { category: "catB", subcategory: "subB1", hookType: "rokovi" })).toHaveLength(1);
  });

  it("buildUuidToName flattens category + subcategory names", () => {
    const recs = [
      { id: "catA", name: "Pravo", subcategories: [{ id: "subA1", name: "Ustavno" }] },
      { id: "catB", name: "Ekonomija", subcategories: [] },
    ] as unknown as CategoryRecord[];
    const map = buildUuidToName(recs);
    expect(map.catA).toBe("Pravo");
    expect(map.subA1).toBe("Ustavno");
    expect(map.catB).toBe("Ekonomija");
  });
});
