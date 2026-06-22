import { describe, expect, it, beforeEach } from "vitest";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { bulkPutReviewLog, loadRecentReviewLog } from "@/lib/db/queries";
import {
  resetReviewSettingsQueryCache,
  seedReviewLogCache,
  REVIEW_LOG_BOOT_DAYS,
} from "@/lib/query/review-settings-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import { simulateAppSessionReset } from "@/test/helpers/persistence-contract";

function makeEntry(id: string, ts: number): ReviewLogEntry {
  return {
    cardId: id,
    sectionId: "sec",
    grade: 3,
    timestamp: ts,
    category: "cat",
  };
}

describe("review-settings persistence contract", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    resetReviewSettingsQueryCache();
  });

  it("review log survives session reset + cache reseed from SQLite", async () => {
    const base = Date.now();
    const entries = [makeEntry("c1", base), makeEntry("c2", base + 60_000)];
    await bulkPutReviewLog(entries);

    const fromDb = await loadRecentReviewLog(REVIEW_LOG_BOOT_DAYS);
    expect(fromDb.length).toBe(2);

    simulateAppSessionReset();
    expect(
      queryClient.getQueryData(queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS)),
    ).toBeUndefined();

    const reloaded = await loadRecentReviewLog(REVIEW_LOG_BOOT_DAYS);
    seedReviewLogCache(reloaded, REVIEW_LOG_BOOT_DAYS);

    const cached = queryClient.getQueryData<ReviewLogEntry[]>(
      queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
    );
    expect(cached?.map((e) => e.cardId).sort()).toEqual(["c1", "c2"]);
  });
});
