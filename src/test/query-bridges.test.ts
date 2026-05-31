/**
 * PR-7f M1 — TanStack bridge invalidira queryClient na SSOT eventove.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { _resetBridgesForTest, installQueryBridges } from "@/lib/query/bridges";
// Tests are whitelisted from W12 — deep import OK for inspecting domain internals.
import { plannerCache, disciplineCache } from "@/domains/planner/cache";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { DEFAULT_CONFIG } from "@/domains/planner";
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

    const cardsCalls = () => invalidateSpy.mock.calls.filter(
      ([arg]) => Array.isArray((arg as { queryKey: unknown }).queryKey)
        && ((arg as { queryKey: string[] }).queryKey[0] === "cards"),
    );

    it("coalesces a burst of unscoped notifyCardsChanged into a single prefix invalidation", () => {
      for (let i = 0; i < 100; i++) notifyCardsChanged();
      expect(cardsCalls().length).toBe(0);

      vi.advanceTimersByTime(20);

      const after = cardsCalls();
      expect(after.length).toBe(1);
      expect(after[0][0]).toEqual({ queryKey: ["cards"] });
    });

    it("re-arms after flushing", () => {
      notifyCardsChanged();
      vi.advanceTimersByTime(20);
      notifyCardsChanged();
      notifyCardsChanged();
      vi.advanceTimersByTime(20);

      expect(cardsCalls().length).toBe(2);
    });

    it("invalidates only affected scoped keys for category emits", () => {
      for (let i = 0; i < 50; i++) {
        notifyCardsChanged({ kind: "category", categoryId: "A" });
        notifyCardsChanged({ kind: "category", categoryId: "B" });
      }
      vi.advanceTimersByTime(20);

      const keys = cardsCalls().map(([arg]) => (arg as { queryKey: readonly unknown[] }).queryKey);
      // Should NOT include the bare ["cards"] prefix — that's only on unscoped escalation.
      expect(keys.some(k => k.length === 1 && k[0] === "cards")).toBe(false);
      // Should include both category prefixes.
      expect(keys).toContainEqual(["cards", "cat", "A"]);
      expect(keys).toContainEqual(["cards", "cat", "B"]);
      // Should include the shared "all" slice once.
      expect(keys.filter(k => k[1] === "all").length).toBe(1);
    });

    it("escalates to ['cards'] prefix when an unscoped emit joins scoped ones", () => {
      notifyCardsChanged({ kind: "category", categoryId: "A" });
      notifyCardsChanged(); // unscoped escalates
      notifyCardsChanged({ kind: "category", categoryId: "B" });
      vi.advanceTimersByTime(20);

      const calls = cardsCalls();
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toEqual({ queryKey: ["cards"] });
    });

    it("forces a flush at max-wait when the trailing window keeps resetting", () => {
      // 30 emits, every 10ms = 300ms continuous burst; trailing (16ms) never expires.
      for (let i = 0; i < 30; i++) {
        notifyCardsChanged();
        vi.advanceTimersByTime(10);
      }
      // After ~300ms wall-time we should have seen at least one max-wait flush.
      const midCount = cardsCalls().length;
      expect(midCount).toBeGreaterThanOrEqual(1);

      // Drain the final trailing window.
      vi.advanceTimersByTime(20);
      expect(cardsCalls().length).toBeGreaterThanOrEqual(midCount);
    });
  });
});

