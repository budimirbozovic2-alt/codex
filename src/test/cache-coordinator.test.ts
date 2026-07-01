import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import * as dbQueries from "@/lib/db/queries";
import * as categoriesInvalidation from "@/lib/query/categories-invalidation";
import {
  abortCardsWrite,
  appendReviewLogOptimistic,
  beginCardsWrite,
  beginCategoriesWrite,
  beginReviewLogWrite,
  commitCardsWriteFromDb,
  commitCategoriesWriteFromDb,
  commitDeferredBootSeed,
  commitReviewLogFromDb,
  ensureCardsBootCache,
  ensureCategoriesBootCache,
  getCardsCacheWriteGeneration,
  getCardsHydrated,
  getCategoriesCacheWriteGeneration,
  getCategoriesHydrated,
  getSrSettingsSnapshot,
  replaceReviewLogCache,
  resetCardsQueryCache,
  resetCategoriesQueryCache,
  resetReviewSettingsQueryCache,
  REVIEW_LOG_BOOT_DAYS,
  seedCardsQueryCache,
  seedCategoriesQueryCache,
  seedReviewLogCache,
  seedSrSettingsCache,
} from "@/lib/query/cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { reviewLogRepository } from "@/lib/repositories";

const FRESH_CARD: Card[] = [{ id: "fresh" } as Card];
const FRESH_CATEGORY: CategoryRecord[] = [
  { id: "fresh", name: "Fresh", sortOrder: 0, subcategories: [] },
];

function isolateCardsQueryClient(): void {
  resetCardsQueryCache();
  queryClient.removeQueries({ queryKey: queryKeys.cards.root });
}

function isolateCategoriesQueryClient(): void {
  resetCategoriesQueryCache();
  queryClient.removeQueries({ queryKey: queryKeys.categories.root });
}

function isolateReviewSettingsQueryClient(): void {
  resetReviewSettingsQueryCache();
  queryClient.removeQueries({ queryKey: queryKeys.review.root });
  queryClient.removeQueries({ queryKey: queryKeys.settings.root });
}

function makeReviewEntry(i: number): ReviewLogEntry {
  return {
    cardId: `card-${i}`,
    sectionId: "sec",
    grade: 3,
    timestamp: Date.now() + i,
    category: "cat",
  };
}

describe("cache-coordinator", () => {
  describe("cards", () => {
    beforeEach(() => {
      isolateCardsQueryClient();
    });

    afterEach(() => {
      isolateCardsQueryClient();
      vi.restoreAllMocks();
    });

    it("resetCardsQueryCache clears stale card queries", () => {
      queryClient.setQueryData(queryKeys.cards.all(), [{ id: "stale" } as Card]);
      queryClient.setQueryData(queryKeys.cards.countAll(), 1);
      seedCardsQueryCache([{ id: "stale" } as Card]);
      expect(getCardsHydrated()).toBe(true);

      resetCardsQueryCache();

      expect(queryClient.getQueryData(queryKeys.cards.all())).toBeUndefined();
      expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBeUndefined();
      expect(getCardsHydrated()).toBe(false);
    });

    it("seedCardsQueryCache seeds all + count from authoritative rows", () => {
      const cards = [{ id: "a" }, { id: "b" }] as Card[];
      seedCardsQueryCache(cards);

      expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(cards);
      expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBe(2);
      expect(getCardsHydrated()).toBe(true);
    });

    it("beginCardsWrite bumps generation and deferred seed respects it", () => {
      const bootGen = getCardsCacheWriteGeneration();
      beginCardsWrite();
      expect(commitDeferredBootSeed([{ id: "stale" } as Card], bootGen)).toBe(false);
      expect(seedCardsQueryCache([{ id: "new" } as Card])).toBe(true);
    });

    it("commitCardsWriteFromDb seeds without invalidate/refetch", async () => {
      vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH_CARD);
      vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
      vi.spyOn(dbQueries, "notifyCardsChanged").mockImplementation(() => {});

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const refetchSpy = vi.spyOn(queryClient, "refetchQueries");
      const count = await commitCardsWriteFromDb();
      expect(count).toBe(1);
      expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH_CARD);
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(refetchSpy).not.toHaveBeenCalled();
    });

    it("commitCardsWriteFromDb notifies derived-only invalidation", async () => {
      vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH_CARD);
      vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
      const notifySpy = vi
        .spyOn(dbQueries, "notifyCardsChanged")
        .mockImplementation(() => {});

      await commitCardsWriteFromDb();
      expect(notifySpy).toHaveBeenCalledWith({ kind: "derived" });
      expect(notifySpy).not.toHaveBeenCalledWith({ kind: "all" });
    });

    it("abortCardsWrite resyncs without generation guard", async () => {
      vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH_CARD);
      vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
      vi.spyOn(dbQueries, "notifyCardsChanged").mockImplementation(() => {});

      beginCardsWrite();
      const count = await abortCardsWrite();
      expect(count).toBe(1);
      expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH_CARD);
    });

    it("ensureCardsBootCache hydrates via direct SQLite read before READY", async () => {
      vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH_CARD);
      vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);

      const gen = getCardsCacheWriteGeneration();
      const count = await ensureCardsBootCache(gen);
      expect(count).toBe(1);
      expect(getCardsHydrated()).toBe(true);
      expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBe(1);
      expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH_CARD);
    });

    it("ensureCardsBootCache skips stale seed when import bumped generation", async () => {
      vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH_CARD);
      vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);

      const gen = getCardsCacheWriteGeneration();
      beginCardsWrite();
      const count = await ensureCardsBootCache(gen);
      expect(count).toBe(-1);
      expect(getCardsHydrated()).toBe(false);
    });
  });

  describe("categories", () => {
    beforeEach(() => {
      isolateCategoriesQueryClient();
    });

    afterEach(() => {
      isolateCategoriesQueryClient();
      vi.restoreAllMocks();
    });

    it("beginCategoriesWrite bumps generation and stale seed is rejected", () => {
      const bootGen = getCategoriesCacheWriteGeneration();
      beginCategoriesWrite();
      expect(
        seedCategoriesQueryCache(
          [{ id: "stale", name: "Stale", sortOrder: 0, subcategories: [] }],
          bootGen,
        ),
      ).toBe(false);
      expect(
        seedCategoriesQueryCache(
          [{ id: "new", name: "New", sortOrder: 0, subcategories: [] }],
        ),
      ).toBe(true);
    });

    it("commitCategoriesWriteFromDb seeds and invalidates category queries", async () => {
      vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH_CATEGORY);
      vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);

      const invalidateSpy = vi.spyOn(categoriesInvalidation, "invalidateCategoriesCache");

      const count = await commitCategoriesWriteFromDb();
      expect(count).toBe(1);
      expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(FRESH_CATEGORY);
      expect(invalidateSpy).toHaveBeenCalledOnce();
    });

    it("ensureCategoriesBootCache hydrates via direct SQLite read", async () => {
      vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH_CATEGORY);
      vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);

      const gen = getCategoriesCacheWriteGeneration();
      const count = await ensureCategoriesBootCache(gen);
      expect(count).toBe(1);
      expect(getCategoriesHydrated()).toBe(true);
      expect(queryClient.getQueryData(queryKeys.categories.countAll())).toBe(1);
      expect(queryClient.getQueryData(queryKeys.categories.all())).toEqual(FRESH_CATEGORY);
    });

    it("ensureCategoriesBootCache skips stale seed when write bumped generation", async () => {
      vi.spyOn(dbQueries, "listAllCategories").mockResolvedValue(FRESH_CATEGORY);
      vi.spyOn(dbQueries, "countCategories").mockResolvedValue(1);

      const gen = getCategoriesCacheWriteGeneration();
      beginCategoriesWrite();
      const count = await ensureCategoriesBootCache(gen);
      expect(count).toBe(-1);
      expect(getCategoriesHydrated()).toBe(false);
    });
  });

  describe("review & settings", () => {
    beforeEach(() => {
      isolateReviewSettingsQueryClient();
    });

    afterEach(() => {
      isolateReviewSettingsQueryClient();
      vi.restoreAllMocks();
    });

    it("appendReviewLogOptimistic prepends and caps at 5000", () => {
      const entries = Array.from({ length: 5001 }, (_, i) => makeReviewEntry(i));
      seedReviewLogCache(entries.slice(0, 5000));

      appendReviewLogOptimistic(makeReviewEntry(9999));

      const cached = queryClient.getQueryData<ReviewLogEntry[]>(
        queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
      );
      expect(cached).toHaveLength(5000);
      expect(cached?.at(-1)?.cardId).toBe("card-9999");
    });

    it("replaceReviewLogCache replaces full log window", () => {
      seedReviewLogCache([makeReviewEntry(1)]);
      replaceReviewLogCache([makeReviewEntry(2), makeReviewEntry(3)]);
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
});
