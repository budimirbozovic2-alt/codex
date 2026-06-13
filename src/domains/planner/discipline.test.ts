import { beforeEach, describe, it, expect, vi } from "vitest";
import { addDays } from "date-fns";
import {
  calcDisciplineStatus,
  getDisciplineEmoji,
  getDisciplineLabel,
  getCognitiveDebt,
  getDisciplineTrend,
} from "./discipline";
import { disciplineCache } from "./cache";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

vi.mock("@/lib/db/queries", () => ({
  savePlannerDisciplineLog: vi.fn().mockResolvedValue(undefined),
}));

installFixedPlannerClock();

beforeEach(() => {
  disciplineCache.set([]);
});

describe("calcDisciplineStatus", () => {
  it("dailyGoal 0 → neutral", () => {
    expect(calcDisciplineStatus(10, 0, null)).toBe("neutral");
  });

  it(">= 90% + low slippage → diligent", () => {
    expect(calcDisciplineStatus(18, 20, null)).toBe("diligent");
  });

  it(">= 70% → neutral", () => {
    expect(calcDisciplineStatus(15, 20, null)).toBe("neutral");
  });

  it("< 70% → lazy", () => {
    expect(calcDisciplineStatus(5, 20, null)).toBe("lazy");
  });

  it("high slippage downgrades diligent to neutral", () => {
    expect(calcDisciplineStatus(20, 20, 10 * 60 * 1000)).toBe("neutral");
  });
});

describe("discipline labels", () => {
  it("maps status to emoji and label", () => {
    expect(getDisciplineEmoji("diligent")).toBe("🚀");
    expect(getDisciplineLabel("diligent")).toBe("Vrijedan");
    expect(getDisciplineEmoji("lazy")).toBe("🐢");
    expect(getDisciplineLabel("lazy")).toBe("Lijen");
  });
});

describe("getCognitiveDebt", () => {
  it("no lazy yesterday → null", () => {
    expect(getCognitiveDebt()).toBeNull();
  });

  it("lazy yesterday with shortfall → debt message", () => {
    const yesterday = addDays(FIXED_NOW, -1).toISOString().slice(0, 10);
    disciplineCache.set([{
      date: yesterday,
      status: "lazy",
      planCompletion: 25,
      slippageMs: null,
      reviewsDone: 5,
      suggestedReviews: 20,
    }]);
    const debt = getCognitiveDebt();
    expect(debt?.hasDebt).toBe(true);
    expect(debt?.debtCards).toBe(15);
    expect(debt?.message).toContain("Dug");
  });
});

describe("getDisciplineTrend", () => {
  it("empty log → []", () => {
    expect(getDisciplineTrend()).toEqual([]);
  });

  it("7-day rolling diligent percentage", () => {
    disciplineCache.set([
      { date: "2026-06-09", status: "diligent", planCompletion: 100, slippageMs: null, reviewsDone: 20, suggestedReviews: 20 },
      { date: "2026-06-10", status: "diligent", planCompletion: 100, slippageMs: null, reviewsDone: 20, suggestedReviews: 20 },
      { date: "2026-06-11", status: "lazy", planCompletion: 40, slippageMs: null, reviewsDone: 8, suggestedReviews: 20 },
      { date: "2026-06-12", status: "neutral", planCompletion: 75, slippageMs: null, reviewsDone: 15, suggestedReviews: 20 },
      { date: "2026-06-13", status: "diligent", planCompletion: 95, slippageMs: null, reviewsDone: 19, suggestedReviews: 20 },
      { date: "2026-06-14", status: "diligent", planCompletion: 100, slippageMs: null, reviewsDone: 20, suggestedReviews: 20 },
      { date: "2026-06-15", status: "diligent", planCompletion: 100, slippageMs: null, reviewsDone: 20, suggestedReviews: 20 },
    ]);
    const trend = getDisciplineTrend(3);
    expect(trend).toHaveLength(3);
    expect(trend[trend.length - 1].diligentPct).toBeGreaterThan(50);
  });
});
