/**
 * Direct TanStack invalidation for satellite domains (TD-ARCH-5).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { resetPlannerQueryCache } from "@/lib/query/planner-cache-coordinator";
import { plannerCache, disciplineCache } from "@/domains/planner/cache";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { DEFAULT_CONFIG } from "@/domains/planner";
import { notifyCardsChanged } from "@/lib/db/queries";
import {
  invalidateImportSatelliteQueries,
  invalidateMindMapsQueries,
  invalidateMnemonicsQueries,
  invalidateKnowledgeBaseQueries,
} from "@/lib/query/domain-invalidation";

describe("domain-invalidation (TD-ARCH-5)", () => {
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetPlannerQueryCache();
    invalidateSpy = vi.fn().mockResolvedValue(undefined);
    queryClient.invalidateQueries = invalidateSpy as unknown as QueryClient["invalidateQueries"];
  });

  it("invalidates ['sources'] when sources cache changes", () => {
    invalidateSourcesCache();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sources"] });
  });

  it("seeds planner config in TanStack on plannerCache.set", () => {
    plannerCache.set({ ...DEFAULT_CONFIG, dailyAvailableMinutes: 42 });
    expect(queryClient.getQueryData(queryKeys.planner.config())).toEqual(
      expect.objectContaining({ dailyAvailableMinutes: 42 }),
    );
  });

  it("invalidates derived planner queries on disciplineCache.set", () => {
    disciplineCache.set([]);
    expect(queryClient.getQueryData(queryKeys.planner.disciplineLog())).toEqual([]);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.planner.root }),
    );
  });

  it("refreshImportSatelliteQueries invalidates all satellite domains", () => {
    invalidateImportSatelliteQueries();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sources"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mindMaps"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mnemonics"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledgeBase"] });
  });

  describe("cards direct invalidation", () => {
    const cardsCalls = () => invalidateSpy.mock.calls.filter(
      ([arg]) => Array.isArray((arg as { queryKey: unknown }).queryKey)
        && ((arg as { queryKey: string[] }).queryKey[0] === "cards"),
    );

    it("invalidates scoped keys immediately for category scope", () => {
      notifyCardsChanged({ kind: "category", categoryId: "A" });
      expect(cardsCalls().length).toBeGreaterThan(0);
      expect(cardsCalls().map(([arg]) => (arg as { queryKey: readonly unknown[] }).queryKey))
        .toContainEqual(["cards", "cat", "A"]);
    });

    it("prefix invalidation fires immediately for unscoped notify", () => {
      notifyCardsChanged();
      expect(cardsCalls()).toContainEqual([{ queryKey: ["cards"] }]);
    });
  });

  it("invalidateMindMapsQueries targets mindMaps root", () => {
    invalidateMindMapsQueries();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mindMaps"] });
  });

  it("invalidateMnemonicsQueries targets mnemonics root", () => {
    invalidateMnemonicsQueries();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["mnemonics"] });
  });

  it("invalidateKnowledgeBaseQueries targets knowledgeBase root", () => {
    invalidateKnowledgeBaseQueries();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["knowledgeBase"] });
  });
});
