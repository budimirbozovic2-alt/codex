/**
 * PR-7f M1 — TanStack bridge invalidira queryClient na SSOT eventove.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { _resetBridgesForTest, installQueryBridges } from "@/lib/query/bridges";
import { plannerCache, disciplineCache } from "@/lib/planner/cache";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { DEFAULT_CONFIG } from "@/lib/planner/types";
import { notifyCardsChanged } from "@/lib/db/queries";

describe("query bridges (PR-7f M1)", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetBridgesForTest();
    qc = new QueryClient();
    invalidateSpy = vi.fn().mockResolvedValue(undefined);
    qc.invalidateQueries = invalidateSpy as unknown as QueryClient["invalidateQueries"];
    installQueryBridges(qc);
  });

  it("invalidates ['sources'] when sources cache changes", () => {
    invalidateSourcesCache();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sources"] });
  });

  it("invalidates ['planner'] on config change", () => {
    plannerCache.set({ ...DEFAULT_CONFIG, dailyAvailableMinutes: 42 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["planner"] });
  });

  it("invalidates ['planner','discipline'] on discipline change", () => {
    disciplineCache.set([]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["planner", "discipline"] });
  });

  it("is idempotent — second install is a no-op", () => {
    const callsBefore = invalidateSpy.mock.calls.length;
    installQueryBridges(qc);
    invalidateSourcesCache();
    // Only one bridge fired
    expect(invalidateSpy.mock.calls.length).toBe(callsBefore + 1);
  });

  describe("cards invalidation debounce", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("coalesces a burst of notifyCardsChanged into a single invalidation", () => {
      // 100 rapid commits in the same tick
      for (let i = 0; i < 100; i++) notifyCardsChanged();

      // Nothing fired synchronously — debounced.
      const cardsCalls = invalidateSpy.mock.calls.filter(
        ([arg]) => Array.isArray((arg as { queryKey: unknown }).queryKey)
          && ((arg as { queryKey: string[] }).queryKey[0] === "cards"),
      );
      expect(cardsCalls.length).toBe(0);

      // Advance past the 16ms window.
      vi.advanceTimersByTime(20);

      const after = invalidateSpy.mock.calls.filter(
        ([arg]) => Array.isArray((arg as { queryKey: unknown }).queryKey)
          && ((arg as { queryKey: string[] }).queryKey[0] === "cards"),
      );
      expect(after.length).toBe(1);
      expect(after[0][0]).toEqual({ queryKey: ["cards"] });
    });

    it("re-arms after flushing", () => {
      notifyCardsChanged();
      vi.advanceTimersByTime(20);
      notifyCardsChanged();
      notifyCardsChanged();
      vi.advanceTimersByTime(20);

      const cardsCalls = invalidateSpy.mock.calls.filter(
        ([arg]) => Array.isArray((arg as { queryKey: unknown }).queryKey)
          && ((arg as { queryKey: string[] }).queryKey[0] === "cards"),
      );
      expect(cardsCalls.length).toBe(2);
    });
  });
});

