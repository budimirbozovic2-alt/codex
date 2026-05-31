// A1c-4 F1/F2 — categoryRepository writes through SQLite.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { listAllCategories } from "@/lib/db/queries";
import { getTestSqlExecutor } from "./sqlite-harness";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function rec(id: string, name = id): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

describe("categoryRepository", () => {
  beforeEach(() => {
    __resetCategoryStoreForTests();
  });
  afterEach(() => {
    __resetCategoryStoreForTests();
  });

  it("replaceAll writes the SSOT store synchronously", () => {
    replaceAll([rec("a"), rec("b")]);
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("commit pushes optimistic state immediately and persists to SQLite", async () => {
    await commit(() => [rec("x"), rec("y")], "test-commit");
    expect(categoryStore.getState().records.map(r => r.id)).toEqual(["x", "y"]);
    const persisted = await listAllCategories();
    expect(persisted.map(r => r.id).sort()).toEqual(["x", "y"]);
  });

  it("commit rolls back the mirror when SQLite persist throws", async () => {
    replaceAll([rec("orig")]);
    const exec = getTestSqlExecutor();
    const spy = vi.spyOn(exec, "transaction").mockRejectedValueOnce(new Error("boom"));
    // Wave-1 hardening: commit now re-throws so callers can react (toast,
    // retry). The mirror must still roll back to the pre-commit snapshot.
    await expect(commit(() => [rec("opt")], "rollback-check")).rejects.toThrow(/boom/);
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
