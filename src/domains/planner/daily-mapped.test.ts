import { beforeEach, describe, it, expect, vi } from "vitest";
import { addDays } from "date-fns";
import {
  getDailyMappedCount,
  incrementDailyMapped,
  autoRedistributeIfNeeded,
} from "./daily-mapped";
import { dailyMappedCache, disciplineCache, lastRedistributeCache } from "./cache";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

vi.mock("@/lib/db/queries", () => ({
  saveDailyMapped: vi.fn().mockResolvedValue(undefined),
  saveLastRedistribute: vi.fn().mockResolvedValue(undefined),
}));

installFixedPlannerClock();

const today = FIXED_NOW.toISOString().slice(0, 10);
const yesterday = addDays(FIXED_NOW, -1).toISOString().slice(0, 10);
const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);

beforeEach(() => {
  dailyMappedCache.set({ date: "", count: 0 });
  disciplineCache.set([]);
  lastRedistributeCache.set("");
});

describe("getDailyMappedCount / incrementDailyMapped", () => {
  it("returns 0 when slot is stale", () => {
    dailyMappedCache.set({ date: "2026-01-01", count: 5 });
    expect(getDailyMappedCount()).toBe(0);
  });

  it("increments today's counter", () => {
    expect(incrementDailyMapped(2)).toBe(2);
    expect(getDailyMappedCount()).toBe(2);
    expect(incrementDailyMapped(1)).toBe(3);
  });
});

describe("autoRedistributeIfNeeded", () => {
  const cards = Array.from({ length: 20 }, (_, i) =>
    makeCard({
      id: `c-${i}`,
      sections: [makeSection({ lastReviewed: null })],
    }),
  );

  it("no goal → null", () => {
    expect(autoRedistributeIfNeeded(cards, null, 0)).toBeNull();
  });

  it("already redistributed today → null", () => {
    lastRedistributeCache.set(today);
    disciplineCache.set([{
      date: yesterday,
      status: "lazy",
      planCompletion: 40,
      slippageMs: null,
      reviewsDone: 5,
      suggestedReviews: 20,
    }]);
    expect(autoRedistributeIfNeeded(cards, goal, 0)).toBeNull();
  });

  it("diligent yesterday → marks today and skips", () => {
    disciplineCache.set([{
      date: yesterday,
      status: "diligent",
      planCompletion: 100,
      slippageMs: null,
      reviewsDone: 20,
      suggestedReviews: 20,
    }]);
    expect(autoRedistributeIfNeeded(cards, goal, 0)).toBeNull();
    expect(lastRedistributeCache.get()).toBe(today);
  });

  it("lazy yesterday → rebalanced quota", () => {
    disciplineCache.set([{
      date: yesterday,
      status: "lazy",
      planCompletion: 40,
      slippageMs: null,
      reviewsDone: 5,
      suggestedReviews: 20,
    }]);
    const result = autoRedistributeIfNeeded(cards, goal, 0);
    expect(result?.redistributed).toBe(true);
    expect(result!.newQuota).toBeGreaterThan(0);
    expect(lastRedistributeCache.get()).toBe(today);
  });
});
