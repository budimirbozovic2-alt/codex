import { beforeEach, describe, it, expect, vi } from "vitest";
import { addDays, differenceInDays } from "date-fns";
import {
  sectionReviewKey,
  todayDateKey,
  countDailyLearnProgress,
  countUniqueSectionsOnDate,
  resolveDailyDisciplineGoal,
  buildSessionDisciplinePayload,
} from "./session-discipline";
import { plannerCache } from "./cache";
import { DEFAULT_CONFIG } from "./types";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

beforeEach(() => {
  plannerCache.set({
    ...DEFAULT_CONFIG,
    finalGoalDate: addDays(FIXED_NOW, 30).toISOString().slice(0, 10),
    dailyAvailableMinutes: 240,
    bufferPercent: 0,
  });
});

describe("sectionReviewKey / todayDateKey", () => {
  it("formats stable keys", () => {
    expect(sectionReviewKey("c1", "s1")).toBe("c1:s1");
    expect(todayDateKey(FIXED_NOW)).toBe("2026-06-15");
  });
});

describe("countUniqueSectionsOnDate", () => {
  it("dedupes multiple grades for the same section on one day", () => {
    const day = "2026-06-15";
    const noon = new Date(`${day}T12:00:00.000Z`).getTime();
    const log: ReviewLogEntry[] = [
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: noon, category: "cat" },
      { cardId: "c1", sectionId: "s1", grade: 4, timestamp: noon + 60_000, category: "cat" },
      { cardId: "c1", sectionId: "s2", grade: 3, timestamp: noon, category: "cat" },
    ];
    expect(countUniqueSectionsOnDate(log, day)).toBe(2);
  });

  it("merges session keys not yet flushed into review log", () => {
    expect(countUniqueSectionsOnDate([], "2026-06-15", new Set(["c9:s9", "c1:s1"]))).toBe(2);
  });
});

describe("countDailyLearnProgress", () => {
  it("counts only first-ever reviews that happened today", () => {
    const today = "2026-06-15";
    const todayNoon = new Date(`${today}T12:00:00.000Z`).getTime();
    const yesterday = "2026-06-14";
    const yesterdayNoon = new Date(`${yesterday}T12:00:00.000Z`).getTime();
    const log: ReviewLogEntry[] = [
      // Learned yesterday → should NOT count today.
      { cardId: "c1", sectionId: "s1", grade: 3, timestamp: yesterdayNoon, category: "cat" },
      { cardId: "c1", sectionId: "s1", grade: 4, timestamp: todayNoon, category: "cat" },
      // First-ever today → should count.
      { cardId: "c2", sectionId: "s2", grade: 3, timestamp: todayNoon, category: "cat" },
      // Same section multiple times today → still counts once.
      { cardId: "c2", sectionId: "s2", grade: 5, timestamp: todayNoon + 60_000, category: "cat" },
    ];
    expect(countDailyLearnProgress(log, today)).toBe(1);
  });
});

describe("resolveDailyDisciplineGoal", () => {
  it("reads smart suggestion from persisted planner config", () => {
    const goalDate = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);
    plannerCache.set({
      ...DEFAULT_CONFIG,
      finalGoalDate: goalDate,
      dailyAvailableMinutes: 240,
      bufferPercent: 0,
    });
    const sectionCount = 30;
    const cards = Array.from({ length: sectionCount }, (_, i) =>
      makeCard({
        id: `c-${i}`,
        sections: [makeSection({ lastReviewed: null })],
      }),
    );
    const daysLeft = differenceInDays(new Date(goalDate), FIXED_NOW);
    expect(resolveDailyDisciplineGoal(cards)).toBe(Math.ceil(sectionCount / daysLeft));
  });
});

describe("buildSessionDisciplinePayload", () => {
  it("uses unique section count for reviewsDone", () => {
    const day = "2026-06-15";
    vi.setSystemTime(new Date(`${day}T18:00:00.000Z`));
    const payload = buildSessionDisciplinePayload({
      reviewLog: [
        { cardId: "c1", sectionId: "s1", grade: 3, timestamp: Date.now(), category: "cat" },
      ],
      cards: [],
      sessionSectionKeys: new Set(["c2:s2"]),
    });
    expect(payload.date).toBe(day);
    expect(payload.reviewsDone).toBe(2);
    expect(payload.dailyGoal).toBeGreaterThanOrEqual(0);
  });
});
