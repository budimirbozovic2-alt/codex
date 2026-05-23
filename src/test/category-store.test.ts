// Phase 5B — external category store mirror.
import { describe, it, expect, beforeEach } from "vitest";
import {
  categoryStore,
  setCategoryStoreRecords,
  getCategoryStoreRecords,
  __resetCategoryStoreForTests,
} from "@/store/useCategoryStore";
import type { CategoryRecord } from "@/lib/db";

function makeRec(id: string, subs: Array<{ id: string; chapters?: string[] }> = []): CategoryRecord {
  return {
    id, name: id, sortOrder: 0,
    subcategories: subs.map((s, i) => ({
      id: s.id, name: s.id, sortOrder: i,
      chapters: (s.chapters ?? []).map((c, j) => ({ id: c, name: c, sortOrder: j })),
    })),
  };
}

describe("Phase 5B — categoryStore mirror", () => {
  beforeEach(() => __resetCategoryStoreForTests());

  it("replaces records and rebuilds derived indexes", () => {
    const recs = [makeRec("a", [{ id: "s1", chapters: ["c1", "c2"] }])];
    setCategoryStoreRecords(recs);
    const idx = categoryStore.getState();
    expect(idx.byId.get("a")?.id).toBe("a");
    expect(idx.subById.get("s1")?.id).toBe("s1");
    expect(idx.subParent.get("s1")?.id).toBe("a");
    expect(idx.chById.get("c2")?.id).toBe("c2");
    expect(getCategoryStoreRecords()).toBe(recs);
  });

  it("skips no-op writes when array identity is unchanged", () => {
    const recs = [makeRec("a")];
    setCategoryStoreRecords(recs);
    const before = categoryStore.getState();
    setCategoryStoreRecords(recs);
    expect(categoryStore.getState()).toBe(before);
  });

  it("notifies subscribers when records replace", () => {
    let n = 0;
    const off = categoryStore.subscribe(() => { n++; });
    setCategoryStoreRecords([makeRec("a")]);
    setCategoryStoreRecords([makeRec("a"), makeRec("b")]);
    off();
    expect(n).toBe(2);
  });
});
