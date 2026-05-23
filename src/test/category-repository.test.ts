// Phase 5C — categoryRepository.commit + replaceAll write through the mirror.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, type CategoryRecord } from "@/lib/db";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import {
  categoryRepository,
  commit,
  replaceAll,
  type CategoriesUpdatedPayload,
} from "@/lib/repositories/categoryRepository";
import {
  categoryStore,
  __resetCategoryStoreForTests,
} from "@/store/useCategoryStore";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function rec(id: string, name = id): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

describe("Phase 5C — categoryRepository", () => {
  beforeEach(async () => {
    __resetCategoryStoreForTests();
    await db.open();
    await db.categories.clear();
  });
  afterEach(() => {
    __resetCategoryStoreForTests();
  });

  it("replaceAll writes the mirror and emits 'repository-replace'", () => {
    const events: CategoriesUpdatedPayload[] = [];
    const off = eventBus.subscribe<CategoriesUpdatedPayload>(
      EVENT_TYPES.CATEGORIES_UPDATED, (p) => { events.push(p); },
    );
    replaceAll([rec("a"), rec("b")]);
    off();
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["a", "b"]);
    expect(events.find(e => e.source === "repository-replace")).toBeTruthy();
  });

  it("commit pushes optimistic state immediately and persists to IDB", async () => {
    await commit(() => [rec("x"), rec("y")], "test-commit");
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["x", "y"]);
    const persisted = await db.categories.toArray();
    expect(persisted.map(r => r.id).sort()).toEqual(["x", "y"]);
  });

  it("commit emits 'repository' so the invalidator skips its own write", async () => {
    const events: CategoriesUpdatedPayload[] = [];
    const off = eventBus.subscribe<CategoriesUpdatedPayload>(
      EVENT_TYPES.CATEGORIES_UPDATED, (p) => { events.push(p); },
    );
    await commit(() => [rec("a")], "tag-check");
    off();
    expect(events.find(e => e.source === "repository")).toBeTruthy();
  });

  it("commit rolls back the mirror when IDB persist throws", async () => {
    replaceAll([rec("orig")]);
    const spy = vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("boom"));
    await commit(() => [rec("opt")], "rollback-check");
    await tick();
    // After rollback we should NOT see the optimistic value.
    const ids = categoryStore.getState().records.map(r => r.id);
    expect(ids).not.toEqual(["opt"]);
    spy.mockRestore();
  });

  it("snapshot returns the live mirror records", () => {
    replaceAll([rec("only")]);
    expect(categoryRepository.snapshot().map(r => r.id)).toEqual(["only"]);
  });
});
