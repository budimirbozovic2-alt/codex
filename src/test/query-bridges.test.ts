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
});
