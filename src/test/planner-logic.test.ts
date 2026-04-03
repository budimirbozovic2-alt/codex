import { describe, it, expect } from "vitest";
import {
  calcVelocity,
  calcEstimatedFinish,
  getPlannerStatus,
  calcRebalancedQuota,
  calcDisciplineStatus,
  calcDailyTimeRecommendation,
  calcLearningReviewRatio,
  getProjectionText,
  getPhaseDisciplinePct,
} from "@/lib/planner-storage";
import type { ReviewLogEntry } from "@/lib/storage";
import { addDays } from "date-fns";

// ─── calcVelocity ────────────────────────────────────────

describe("calcVelocity", () => {
  it("returns 0 for empty log", () => {
    expect(calcVelocity([], 7)).toBe(0);
  });

  it("counts unique section first-reviews per day", () => {
    const now = Date.now();
    const log: ReviewLogEntry[] = [
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: now - 86400000 },
      { cardId: "c1", sectionId: "s2", grade: 3, timestamp: now - 86400000 },
      { cardId: "c1", sectionId: "s1", grade: 4, timestamp: now }, // duplicate section
    ];
    const v = calcVelocity(log, 7);
    expect(v).toBeCloseTo(2 / 7, 1);
  });
});

// ─── calcEstimatedFinish ─────────────────────────────────

describe("calcEstimatedFinish", () => {
  it("velocity 0 → null", () => {
    expect(calcEstimatedFinish(100, 0)).toBeNull();
  });

  it("remaining 0 → today", () => {
    const result = calcEstimatedFinish(0, 5);
    expect(result).not.toBeNull();
    expect(result!.toDateString()).toBe(new Date().toDateString());
  });

  it("positive values → future date", () => {
    const result = calcEstimatedFinish(70, 10);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── getPlannerStatus ────────────────────────────────────

describe("getPlannerStatus", () => {
  it("no goal → no-goal", () => {
    expect(getPlannerStatus(new Date(), null).status).toBe("no-goal");
  });

  it("no estimated finish → no-goal", () => {
    expect(getPlannerStatus(null, "2026-12-01").status).toBe("no-goal");
  });

  it("finish before goal → green", () => {
    const goal = addDays(new Date(), 60).toISOString().slice(0, 10);
    const finish = addDays(new Date(), 20);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("green");
  });

  it("finish slightly after goal → yellow", () => {
    const goal = addDays(new Date(), 30).toISOString().slice(0, 10);
    const finish = addDays(new Date(), 35);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("yellow");
  });

  it("finish way after goal → red", () => {
    const goal = addDays(new Date(), 30).toISOString().slice(0, 10);
    const finish = addDays(new Date(), 60);
    expect(getPlannerStatus(finish, goal, 0).status).toBe("red");
  });
});

// ─── calcRebalancedQuota ─────────────────────────────────

describe("calcRebalancedQuota", () => {
  it("no goal → null", () => {
    expect(calcRebalancedQuota(100, null, 0)).toBeNull();
  });

  it("distributes remaining over days", () => {
    const goal = addDays(new Date(), 10).toISOString().slice(0, 10);
    const result = calcRebalancedQuota(50, goal, 0);
    expect(result).not.toBeNull();
    expect(result!.newDailyQuota).toBe(5);
    expect(result!.daysLeft).toBe(10);
  });
});

// ─── calcDisciplineStatus ────────────────────────────────

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

// ─── calcDailyTimeRecommendation ─────────────────────────

describe("calcDailyTimeRecommendation", () => {
  it("converts sections to time", () => {
    const r = calcDailyTimeRecommendation(10, 5, 10, 3);
    expect(r.totalMinutes).toBe(60); // (10+10)*3
    expect(r.hours).toBe(1);
    expect(r.minutes).toBe(0);
  });

  it("< 1 hour shows minutes only", () => {
    const r = calcDailyTimeRecommendation(5, 5, 5, 3);
    expect(r.totalMinutes).toBe(30);
    expect(r.hours).toBe(0);
    expect(r.message).toContain("min");
    expect(r.message).not.toContain("h");
  });
});

// ─── calcLearningReviewRatio ─────────────────────────────

describe("calcLearningReviewRatio", () => {
  it("< 20% → 90/10", () => {
    const r = calcLearningReviewRatio(10);
    expect(r.learnPct).toBe(90);
    expect(r.reviewPct).toBe(10);
  });

  it("20-49% → 70/30", () => {
    const r = calcLearningReviewRatio(35);
    expect(r.learnPct).toBe(70);
    expect(r.reviewPct).toBe(30);
  });

  it("50-79% → 40/60", () => {
    const r = calcLearningReviewRatio(65);
    expect(r.learnPct).toBe(40);
    expect(r.reviewPct).toBe(60);
  });

  it(">= 80% → 10/90", () => {
    const r = calcLearningReviewRatio(90);
    expect(r.learnPct).toBe(10);
    expect(r.reviewPct).toBe(90);
  });
});

// ─── getProjectionText ───────────────────────────────────

describe("getProjectionText", () => {
  it("velocity 0 → no data message", () => {
    expect(getProjectionText(0, 100, null, 0)).toContain("Nema dovoljno");
  });

  it("remaining 0 → all done", () => {
    expect(getProjectionText(5, 0, null, 0)).toContain("savladane");
  });
});

// ─── getPhaseDisciplinePct ───────────────────────────────

describe("getPhaseDisciplinePct", () => {
  it("empty log → 0", () => {
    expect(getPhaseDisciplinePct([])).toBe(0);
  });

  it("all diligent → 100", () => {
    const log = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      status: "diligent" as const,
      planCompletion: 100,
      slippageMs: null,
      reviewsDone: 20,
      suggestedReviews: 20,
    }));
    expect(getPhaseDisciplinePct(log)).toBe(100);
  });
});
