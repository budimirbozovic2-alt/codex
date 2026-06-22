import { describe, expect, it, afterEach, vi } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import { seedCategoriesQueryCache } from "@/lib/query/categories-cache-coordinator";
import {
  seedReviewLogCache,
  seedSrSettingsCache,
  REVIEW_LOG_BOOT_DAYS,
  resetReviewSettingsQueryCache,
} from "@/lib/query/review-settings-cache-coordinator";
import {
  resetCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";
import {
  beginAllCachesWrite,
  commitAllCachesFromDb,
} from "@/lib/query/all-caches-coordinator";

describe("import unified write session", () => {
  afterEach(() => {
    resetCategoriesQueryCache();
    resetReviewSettingsQueryCache();
    vi.restoreAllMocks();
  });

  it("commitAllCachesFromDb seeds categories, review and settings", async () => {
    const cats: CategoryRecord[] = [
      { id: "c1", name: "Cat", sortOrder: 0, subcategories: [] },
    ];
    vi.spyOn(reviewLogRepository, "loadRecent").mockResolvedValue([
      {
        cardId: "card-1",
        sectionId: "sec",
        grade: 3,
        timestamp: 1,
        category: "c1",
      },
    ]);
    vi.spyOn(settingsRepository, "save").mockResolvedValue(undefined);

    const session = beginAllCachesWrite({ reviewLog: true });

    await commitAllCachesFromDb(session, {
      freshCategories: cats,
      srSettings: { ...DEFAULT_SR_SETTINGS, maxNewPerDay: 12 },
      syncReviewLog: true,
    });

    expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(cats);
    expect(
      queryClient.getQueryData(queryKeys.review.logRecent(90)),
    ).toEqual([expect.objectContaining({ cardId: "card-1" })]);
    expect(queryClient.getQueryData(queryKeys.settings.sr())).toEqual(
      expect.objectContaining({ maxNewPerDay: 12 }),
    );
  });
});
