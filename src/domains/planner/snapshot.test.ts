import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import { computePlannerSnapshot } from "./snapshot";
import { DEFAULT_CONFIG } from "./types";
import type { CategoryRecord } from "@/lib/db-types";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

const categories: CategoryRecord[] = [
  { id: "cat-a", name: "Pravo", sortOrder: 0, subcategories: [] },
];

describe("computePlannerSnapshot", () => {
  it("returns null without goal date", () => {
    expect(
      computePlannerSnapshot({
        cards: [],
        reviewLog: [],
        categoryRecords: categories,
        config: DEFAULT_CONFIG,
        totalSections: 0,
        learnedSections: 0,
        dueCount: 0,
      }),
    ).toBeNull();
  });

  it("derives daily progress from review log", () => {
    const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);
    const cards = [
      makeCard({ categoryId: "cat-a", sections: [makeSection(), makeSection()] }),
    ];
    const day = "2026-06-15";
    const noon = new Date(`${day}T12:00:00.000Z`).getTime();
    const snapshot = computePlannerSnapshot({
      cards,
      reviewLog: [
        { cardId: cards[0].id, sectionId: cards[0].sections[0].id, grade: 3, timestamp: noon, category: "cat-a" },
      ],
      categoryRecords: categories,
      config: { ...DEFAULT_CONFIG, finalGoalDate: goal, dailyAvailableMinutes: 120 },
      totalSections: 2,
      learnedSections: 0,
      dueCount: 0,
    });
    expect(snapshot?.dailyProgress).toBe(1);
    expect(snapshot?.smartSuggestion?.message).toContain("Pravo");
  });
});
