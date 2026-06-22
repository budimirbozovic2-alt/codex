import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { CategoryRecord } from "@/lib/db-types";
import * as dbQueries from "@/lib/db/queries";
import {
  beginCategoriesWrite,
  commitCategoriesWriteFromDb,
  ensureCategoriesBootCache,
  getCategoriesCacheWriteGeneration,
  getCategoriesHydrated,
  resetCategoriesQueryCache,
  seedCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";

const FRESH: CategoryRecord[] = [
  { id: "fresh", name: "Fresh", sortOrder: 0, subcategories: [] },
];

describe("categories-cache-coordinator", () => {
  afterEach(() => {
    resetCategoriesQueryCache();
    vi.restoreAllMocks();
  });

  it("beginCategoriesWrite bumps generation and stale seed is rejected", () => {
    const bootGen = getCategoriesCacheWriteGeneration();
    beginCategoriesWrite();
    expect(
      seedCategoriesQueryCache(
        [{ id: "stale", name: "Stale", sortOrder: 0, subcategories: [] }],
        bootGen,
      ),
    ).toBe(false);
    expect(
      seedCategoriesQueryCache(
        [{ id: "new", name: "New", sortOrder: 0, subcategories: [] }],
      ),
    ).toBe(true);
  });

  it("commitCategoriesWriteFromDb seeds without invalidate/refetch", async () => {
    vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);
    vi.spyOn(dbQueries, "notifyCategoriesChanged").mockImplementation(() => {});

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");
    const count = await commitCategoriesWriteFromDb();
    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(FRESH);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(refetchSpy).not.toHaveBeenCalled();
    expect(dbQueries.notifyCategoriesChanged).toHaveBeenCalledWith({ kind: "all" });
  });

  it("ensureCategoriesBootCache hydrates via direct SQLite read", async () => {
    vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);

    const gen = getCategoriesCacheWriteGeneration();
    const count = await ensureCategoriesBootCache(gen);
    expect(count).toBe(1);
    expect(getCategoriesHydrated()).toBe(true);
    expect(queryClient.getQueryData(queryKeys.categories.countAll())).toBe(1);
    expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(FRESH);
  });

  it("ensureCategoriesBootCache skips stale seed when write bumped generation", async () => {
    vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);

    const gen = getCategoriesCacheWriteGeneration();
    beginCategoriesWrite();
    const count = await ensureCategoriesBootCache(gen);
    expect(count).toBe(-1);
    expect(getCategoriesHydrated()).toBe(false);
  });
});
