import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { emitDomainChanged } from "@/lib/event-bus";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";
import { REVIEW_LOG_BOOT_DAYS } from "@/lib/query/review-settings-cache-coordinator";

const LOG_ENTRY: ReviewLogEntry = {
  cardId: "from-db",
  sectionId: "sec",
  grade: 4,
  timestamp: 1,
  category: "cat",
};

describe("bridges — review + settings", () => {
  afterEach(() => {
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("review replace seeds log from repository without invalidate", async () => {
    vi.spyOn(reviewLogRepository, "loadRecent").mockResolvedValue([LOG_ENTRY]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    installQueryBridges(queryClient);

    emitDomainChanged({ domain: "review", kind: "replace" });

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS)),
      ).toEqual([LOG_ENTRY]);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("settings sr seeds from repository", async () => {
    vi.spyOn(settingsRepository, "load").mockResolvedValue({
      ...DEFAULT_SR_SETTINGS,
      maxNewPerDay: 99,
    });
    installQueryBridges(queryClient);

    emitDomainChanged({ domain: "settings", kind: "sr" });

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.settings.sr())).toEqual(
        expect.objectContaining({ maxNewPerDay: 99 }),
      );
    });
  });

  it("review append does not invalidate (optimistic path)", () => {
    installQueryBridges(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    emitDomainChanged({ domain: "review", kind: "append" });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
