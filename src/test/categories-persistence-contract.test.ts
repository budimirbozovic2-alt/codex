import { describe, expect, it, beforeEach } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import { bulkPutCategories, listAllCategories, countCategories } from "@/lib/db/queries";
import {
  ensureCategoriesBootCache,
  getCategoriesCacheWriteGeneration,
  getCategoriesHydrated,
  resetCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import {
  assertNoCategoryDecodeGap,
  expectCategoriesCacheEmpty,
  simulateAppSessionReset,
} from "@/test/helpers/persistence-contract";

function rec(id: string): CategoryRecord {
  return { id, name: id, sortOrder: 0, subcategories: [] };
}

describe("categories persistence contract", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    resetCategoriesQueryCache();
  });

  it("single category survives session reset + boot rehydrate", async () => {
    await bulkPutCategories([rec("persist-cat")]);

    expect(await countCategories()).toBe(1);
    expect((await listAllCategories()).map((c) => c.id)).toEqual(["persist-cat"]);

    simulateAppSessionReset();
    expectCategoriesCacheEmpty();

    const gen = getCategoriesCacheWriteGeneration();
    const count = await ensureCategoriesBootCache(gen);
    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "persist-cat" })]),
    );
    expect(getCategoriesHydrated()).toBe(true);
  });

  it("bulk categories survive session reset", async () => {
    const records = Array.from({ length: 5 }, (_, i) => rec(`bulk-cat-${i}`));
    await bulkPutCategories(records);

    simulateAppSessionReset();
    expectCategoriesCacheEmpty();

    const gen = getCategoriesCacheWriteGeneration();
    const count = await ensureCategoriesBootCache(gen);
    expect(count).toBe(5);
    const cached = queryClient.getQueryData<readonly { id: string }[]>(
      queryKeys.categories.all(),
    );
    expect(cached?.map((c) => c.id).sort()).toEqual(
      records.map((c) => c.id).sort(),
    );
  });

  it("no category decode gap after rehydrate", async () => {
    await bulkPutCategories([rec("decode-a"), rec("decode-b")]);

    simulateAppSessionReset();
    const gen = getCategoriesCacheWriteGeneration();
    await ensureCategoriesBootCache(gen);
    await assertNoCategoryDecodeGap("categories contract");
  });
});
