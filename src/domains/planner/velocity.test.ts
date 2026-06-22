import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import { calcVelocity, calcEstimatedFinish, getProjectionText } from "./velocity";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

describe("calcVelocity", () => {
  it("returns 0 for empty log", () => {
    expect(calcVelocity([], 7)).toBe(0);
  });

  it("counts unique section first-reviews per day", () => {
    const now = Date.now();
    const log: ReviewLogEntry[] = [
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: now - 86400000, category: "cat-1" },
      { cardId: "c1", sectionId: "s2", grade: 3, timestamp: now - 86400000, category: "cat-1" },
      { cardId: "c1", sectionId: "s1", grade: 4, timestamp: now, category: "cat-1" },
    ];
    expect(calcVelocity(log, 7)).toBeCloseTo(2 / 7, 1);
  });
});

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

describe("getProjectionText", () => {
  it("velocity 0 → no data message", () => {
    expect(getProjectionText(0, 100, null, 0)).toContain("Nema dovoljno");
  });

  it("remaining 0 → finish projection", () => {
    expect(getProjectionText(5, 0, null, 0)).toContain("završićeš");
  });

  it("with goal before effective deadline → ahead message", () => {
    const goal = addDays(FIXED_NOW, 90).toISOString().slice(0, 10);
    const text = getProjectionText(10, 50, goal, 0);
    expect(text).toContain("prije tvog cilja");
  });
});
