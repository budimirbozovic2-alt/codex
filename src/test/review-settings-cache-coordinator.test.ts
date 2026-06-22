import { describe, expect, it, afterEach, vi } from "vitest";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import {
  appendReviewLogOptimistic,
  beginReviewLogWrite,
  commitReviewLogFromDb,
  replaceReviewLogCache,
  resetReviewSettingsQueryCache,
  REVIEW_LOG_BOOT_DAYS,
  seedReviewLogCache,
  seedSrSettingsCache,
  getSrSettingsSnapshot,
} from "@/lib/query/review-settings-cache-coordinator";
import { reviewLogRepository } from "@/lib/repositories";

function makeEntry(i: number): ReviewLogEntry {
  return {
    cardId: `card-${i}`,
    sectionId: "sec",
    grade: 3,
    timestamp: Date.now() + i,
    category: "cat",
  };
}

describe("review-settings-cache-coordinator", () => {
  afterEach(() => {
    resetReviewSettingsQueryCache();
  });

  it("appendReviewLogOptimistic prepends and caps at 5000", () => {
    const entries = Array.from({ length: 5001 }, (_, i) => makeEntry(i));
    seedReviewLogCache(entries.slice(0, 5000));

    appendReviewLogOptimistic(makeEntry(9999));

    const cached = queryClient.getQueryData<ReviewLogEntry[]>(
      queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
    );
    expect(cached).toHaveLength(5000);
    expect(cached?.at(-1)?.cardId).toBe("card-9999");
  });

  it("replaceReviewLogCache replaces full log window", () => {
    seedReviewLogCache([makeEntry(1)]);
    replaceReviewLogCache([makeEntry(2), makeEntry(3)]);
    const cached = queryClient.getQueryData<ReviewLogEntry[]>(
      queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
    );
    expect(cached).toHaveLength(2);
    expect(cached?.map((e) => e.cardId)).toEqual(["card-2", "card-3"]);
  });

  it("getSrSettingsSnapshot falls back to defaults when cache empty", () => {
    expect(getSrSettingsSnapshot()).toEqual(DEFAULT_SR_SETTINGS);
    const custom = { ...DEFAULT_SR_SETTINGS, maxNewPerDay: 42 };
    seedSrSettingsCache(custom);
    expect(getSrSettingsSnapshot()).toEqual(custom);
  });

  it("beginReviewLogWrite guards stale seed", async () => {
    vi.spyOn(reviewLogRepository, "loadRecent").mockResolvedValue([]);
    const gen = beginReviewLogWrite();
    beginReviewLogWrite();
    const count = await commitReviewLogFromDb(REVIEW_LOG_BOOT_DAYS, gen);
    expect(count).toBe(-1);
  });
});
