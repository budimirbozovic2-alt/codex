// Post Task-B — categoryRepository writes directly to the SSOT store.
// No bus events, no invalidator.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import type { CategoryRecord } from "@/lib/db-types";
import {
  categoryRepository,
  commit,
  replaceAll,
} from "@/lib/repositories/categoryRepository";
import {
  categoryStore,
  __resetCategoryStoreForTests,
} from "@/store/useCategoryStore";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function rec(id: string, name = id): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

describe("categoryRepository", () => {
  beforeEach(async () => {
    __resetCategoryStoreForTests();
    await db.open();
    await db.categories.clear();
  });
  afterEach(() => {
    __resetCategoryStoreForTests();
  });

  it("replaceAll writes the SSOT store synchronously", () => {
    replaceAll([rec("a"), rec("b")]);
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("commit pushes optimistic state immediately and persists to IDB", async () => {
    await commit(() => [rec("x"), rec("y")], "test-commit");
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["x", "y"]);
    const persisted = await db.categories.toArray();
    expect(persisted.map(r => r.id).sort()).toEqual(["x", "y"]);
  });

  it("commit rolls back the mirror when IDB persist throws", async () => {
    replaceAll([rec("orig")]);
    const spy = vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("boom"));
    await commit(() => [rec("opt")], "rollback-check");
    await tick();
    const ids = categoryStore.getState().records.map(r => r.id);
    expect(ids).not.toEqual(["opt"]);
    spy.mockRestore();
  });

  it("snapshot returns the live mirror records", () => {
    replaceAll([rec("only")]);
    expect(categoryRepository.snapshot().map(r => r.id)).toEqual(["only"]);
  });
});
