// A1c-4 F1/F2 — categoryRepository writes through SQLite.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import {
  categoryRepository,
  commit,
  replaceAll,
} from "@/lib/repositories/categoryRepository";
import { listAllCategories } from "@/lib/db/queries";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import {
  getCategoriesFromQueryCache,
  resetCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";
import { getTestSqlExecutor } from "./sqlite-harness";

function rec(id: string, name = id): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

describe("categoryRepository", () => {
  beforeEach(() => {
    resetCategoriesQueryCache();
  });
  afterEach(() => {
    resetCategoriesQueryCache();
  });

  it("replaceAll seeds TanStack cache synchronously", () => {
    replaceAll([rec("a"), rec("b")]);
    expect(
      queryClient.getQueryData(queryKeys.categories.all())?.map(
        (r: CategoryRecord) => r.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("commit pushes optimistic state immediately and persists to SQLite", async () => {
    await commit(() => [rec("x"), rec("y")], "test-commit");
    expect(getCategoriesFromQueryCache().map((r) => r.id)).toEqual(["x", "y"]);
    const persisted = await listAllCategories();
    expect(persisted.map((r) => r.id).sort()).toEqual(["x", "y"]);
  });

  it("commit rolls back TanStack cache when SQLite persist throws", async () => {
    replaceAll([rec("orig")]);
    const exec = getTestSqlExecutor();
    const spy = vi.spyOn(exec, "transaction").mockRejectedValueOnce(new Error("boom"));
    await expect(commit(() => [rec("opt")], "rollback-check")).rejects.toThrow(/boom/);
    expect(getCategoriesFromQueryCache().map((r) => r.id)).toEqual(["orig"]);
    spy.mockRestore();
  });

  it("snapshot returns the live cache records", () => {
    replaceAll([rec("only")]);
    expect(categoryRepository.snapshot().map((r) => r.id)).toEqual(["only"]);
  });
});
