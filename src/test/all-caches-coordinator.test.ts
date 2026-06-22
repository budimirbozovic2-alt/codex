import { describe, expect, it, afterEach, vi } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
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
  runBulkWriteSession,
  syncImportSatelliteCaches,
} from "@/lib/query/all-caches-coordinator";
import { resetBulkWriteDepthForTest, getBulkWriteDepth } from "@/lib/query/bulk-write-session-depth";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";
import * as eventBus from "@/lib/event-bus";
import { metrics } from "@/lib/metrics";

describe("all-caches-coordinator", () => {
  afterEach(() => {
    resetCategoriesQueryCache();
    resetReviewSettingsQueryCache();
    resetBulkWriteDepthForTest();
    metrics.reset();
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("commitAllCachesFromDb seeds categories, cards, review and settings", async () => {
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
      queryClient.getQueryData(queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS)),
    ).toEqual([expect.objectContaining({ cardId: "card-1" })]);
    expect(queryClient.getQueryData(queryKeys.settings.sr())).toEqual(
      expect.objectContaining({ maxNewPerDay: 12 }),
    );
  });

  it("syncImportSatelliteCaches does not re-invalidate core domains", async () => {
    installQueryBridges(queryClient);
    seedCategoriesQueryCache([
      { id: "seed", name: "Seed", sortOrder: 0, subcategories: [] },
    ]);
    seedReviewLogCache([], REVIEW_LOG_BOOT_DAYS);
    seedSrSettingsCache(DEFAULT_SR_SETTINGS);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const emitSpy = vi.spyOn(eventBus, "emitDomainChanged");

    syncImportSatelliteCaches();

    expect(emitSpy).toHaveBeenCalledWith({ domain: "sources" });

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mindMaps"] });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.categories.root,
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.review.root,
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.settings.root,
    });
  });

  it("runBulkWriteSession aborts and resets bulk depth on work failure", async () => {
    await expect(
      runBulkWriteSession({ cards: true }, async () => {
        throw new Error("bulk work failed");
      }),
    ).rejects.toThrow("bulk work failed");

    expect(getBulkWriteDepth()).toBe(0);
  });
});
