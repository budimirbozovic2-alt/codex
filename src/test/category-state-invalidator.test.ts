// Phase 5A — categoryRecords invalidator wiring.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { db, type CategoryRecord } from "@/lib/db";
import {
  initCategoryStateInvalidator,
  registerCategoryStateSetter,
  __teardownCategoryStateInvalidatorForTests,
} from "@/lib/repositories/categoryStateInvalidator";
import { emitCategoriesUpdated } from "@/lib/repositories/categoryRepository";

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function rec(id: string, name = id): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

describe("Phase 5A — categoryStateInvalidator", () => {
  beforeEach(async () => {
    __teardownCategoryStateInvalidatorForTests();
    await db.open();
    await db.categories.clear();
    initCategoryStateInvalidator();
  });
  afterEach(() => {
    __teardownCategoryStateInvalidatorForTests();
  });

  it("skips self-tagged 'repository' emissions", async () => {
    const setter = vi.fn();
    registerCategoryStateSetter(setter);
    emitCategoriesUpdated({ source: "repository", categoryIds: ["a"] as never });
    await tick();
    expect(setter).not.toHaveBeenCalled();
  });

  it("reloads from IDB on external emissions and calls the setter", async () => {
    await db.categories.bulkPut([rec("a"), rec("b")]);
    const setter = vi.fn();
    registerCategoryStateSetter(setter);
    emitCategoriesUpdated({ source: "backup-restore" });
    await tick();
    expect(setter).toHaveBeenCalledTimes(1);
    const payload = setter.mock.calls[0][0] as CategoryRecord[];
    expect(payload.map(r => r.id).sort()).toEqual(["a", "b"]);
  });

  it("is a no-op for setter when none registered but still hydrates the store", async () => {
    await db.categories.bulkPut([rec("x")]);
    // Should not throw.
    emitCategoriesUpdated({ source: "backup-restore" });
    await tick();
    const { getCategoryStoreRecords } = await import("@/store/useCategoryStore");
    expect(getCategoryStoreRecords().map(r => r.id)).toContain("x");
  });

  it("CATEGORIES_UPDATED event is part of the public EVENT_TYPES", () => {
    expect(EVENT_TYPES.CATEGORIES_UPDATED).toBe("categories:updated");
    // sanity — bus subscribe works for this type
    const fn = vi.fn();
    const off = eventBus.subscribe(EVENT_TYPES.CATEGORIES_UPDATED, fn);
    eventBus.emit(EVENT_TYPES.CATEGORIES_UPDATED, { source: "test" });
    expect(fn).toHaveBeenCalled();
    off();
  });
});
