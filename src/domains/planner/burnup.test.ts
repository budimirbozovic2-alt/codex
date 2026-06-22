import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import { buildBurnupData } from "./burnup";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

describe("buildBurnupData", () => {
  const day1 = "2026-06-10";
  const day2 = "2026-06-12";
  const noon1 = new Date(`${day1}T12:00:00.000Z`).getTime();
  const noon2 = new Date(`${day2}T12:00:00.000Z`).getTime();

  it("empty log → empty series", () => {
    expect(buildBurnupData([], 20, null, 0)).toEqual([]);
  });

  it("accumulates unique sections per day", () => {
    const log: ReviewLogEntry[] = [
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: noon1, category: "cat" },
      { cardId: "c1", sectionId: "s2", grade: 3, timestamp: noon1, category: "cat" },
      { cardId: "c2", sectionId: "s1", grade: 3, timestamp: noon2, category: "cat" },
      { cardId: "c1", sectionId: "s1", grade: 4, timestamp: noon2 + 60_000, category: "cat" },
    ];
    const data = buildBurnupData(log, 10, null, 0);
    const day1Point = data.find(d => d.date === day1);
    const day2Point = data.find(d => d.date === day2);
    expect(day1Point?.actual).toBe(2);
    expect(day2Point?.actual).toBe(3);
  });

  it("includes ideal projection when goal is set", () => {
    const log: ReviewLogEntry[] = [
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: noon1, category: "cat" },
    ];
    const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);
    const data = buildBurnupData(log, 100, goal, 15);
    expect(data.some(d => d.ideal != null)).toBe(true);
    expect(data.some(d => d.ideal === 100)).toBe(true);
  });
});
