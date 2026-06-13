import { describe, it, expect } from "vitest";
import { addDays, differenceInDays } from "date-fns";
import {
  getSmartSuggestion,
  calcRebalancedQuota,
  getPlannerStatus,
  calcDailyTimeRecommendation,
} from "./suggestions";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

function makeUnlearnedCards(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeCard({
      id: `card-${i}`,
      categoryId: "cat-1",
      sections: [makeSection({ lastReviewed: null })],
    }),
  );
}

describe("getSmartSuggestion", () => {
  const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);

  it("no goal → null", () => {
    expect(getSmartSuggestion(null, [], null, 15)).toBeNull();
  });

  it("past effective deadline → zero suggestion", () => {
    const past = addDays(FIXED_NOW, -5).toISOString().slice(0, 10);
    const result = getSmartSuggestion(null, makeUnlearnedCards(10), past, 0);
    expect(result?.suggestedToday).toBe(0);
    expect(result?.message).toContain("Rok je prošao");
  });

  it("distributes remaining sections over days left", () => {
    const cards = makeUnlearnedCards(60);
    const daysLeft = differenceInDays(new Date(goal), FIXED_NOW);
    const result = getSmartSuggestion(null, cards, goal, 0);
    expect(result?.suggestedToday).toBe(Math.ceil(60 / daysLeft));
    expect(result?.burnoutWarning).toBe(false);
  });

  it("quota override replaces auto quota", () => {
    const cards = makeUnlearnedCards(60);
    const result = getSmartSuggestion(null, cards, goal, 0, 25);
    expect(result?.suggestedToday).toBe(25);
    expect(result?.message).toContain("Nivelisan plan");
    expect(result?.burnoutWarning).toBe(false);
  });

  it("high quota triggers burnout warning", () => {
    const result = getSmartSuggestion(null, makeUnlearnedCards(10), goal, 0, 65);
    expect(result?.burnoutWarning).toBe(true);
  });

  it("all learned → celebration message", () => {
    const cards = [
      makeCard({
        sections: [makeSection({ lastReviewed: Date.now() })],
      }),
    ];
    const result = getSmartSuggestion(null, cards, goal, 0);
    expect(result?.suggestedToday).toBe(0);
    expect(result?.message).toContain("naučene");
  });

  it("phase-scoped remaining when phase provided", () => {
    const phase = {
      id: "p1",
      name: "Faza 1",
      expectedDays: 14,
      categories: ["cat-a"],
    };
    const cards = [
      makeCard({ categoryId: "cat-a", sections: [makeSection(), makeSection()] }),
      makeCard({ categoryId: "cat-b", sections: [makeSection(), makeSection(), makeSection()] }),
    ];
    const result = getSmartSuggestion(phase, cards, goal, 0);
    expect(result?.suggestedToday).toBe(1);
  });
});

describe("calcRebalancedQuota", () => {
  it("no goal → null", () => {
    expect(calcRebalancedQuota(100, null, 0)).toBeNull();
  });

  it("distributes remaining over days", () => {
    const goal = addDays(FIXED_NOW, 10).toISOString().slice(0, 10);
    const result = calcRebalancedQuota(50, goal, 0);
    expect(result).not.toBeNull();
    expect(result!.newDailyQuota).toBeGreaterThan(0);
    expect(result!.daysLeft).toBeGreaterThanOrEqual(9);
  });
});

describe("getPlannerStatus", () => {
  it("no goal → no-goal", () => {
    expect(getPlannerStatus(new Date(), null).status).toBe("no-goal");
  });

  it("no estimated finish → no-goal", () => {
    expect(getPlannerStatus(null, "2026-12-01").status).toBe("no-goal");
  });

  it("finish before goal → green", () => {
    const goal = addDays(FIXED_NOW, 60).toISOString().slice(0, 10);
    const finish = addDays(FIXED_NOW, 20);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("green");
  });

  it("finish slightly after goal → yellow", () => {
    const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);
    const finish = addDays(FIXED_NOW, 35);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("yellow");
  });

  it("finish way after goal → red", () => {
    const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);
    const finish = addDays(FIXED_NOW, 60);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("red");
  });
});

describe("calcDailyTimeRecommendation", () => {
  it("converts sections to time", () => {
    const r = calcDailyTimeRecommendation(10, 10);
    expect(r.totalMinutes).toBe(60);
    expect(r.hours).toBe(1);
    expect(r.fitsBudget).toBe(true);
  });

  it("within daily budget", () => {
    const r = calcDailyTimeRecommendation(5, 5, 240);
    expect(r.fitsBudget).toBe(true);
    expect(r.message).toContain("unutar 4h dnevno");
  });

  it("over daily budget", () => {
    const r = calcDailyTimeRecommendation(20, 20, 60);
    expect(r.fitsBudget).toBe(false);
    expect(r.message).toContain("premašuje");
  });
});
