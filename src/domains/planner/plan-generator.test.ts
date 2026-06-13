import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import { generateStudyPlan, calcLearningReviewRatio } from "./plan-generator";
import { DEFAULT_CONFIG } from "./types";
import type { CategoryRecord } from "@/lib/db-types";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

const categories: CategoryRecord[] = [
  { id: "cat-a", name: "Pravo", sortOrder: 0, subcategories: [{ id: "sub-1", name: "Uvod", chapters: [], sortOrder: 0 }] },
  { id: "cat-b", name: "Ekonomija", sortOrder: 1, subcategories: [] },
];

describe("generateStudyPlan", () => {
  const goal = addDays(FIXED_NOW, 60).toISOString().slice(0, 10);

  it("no goal → empty", () => {
    expect(generateStudyPlan(DEFAULT_CONFIG, categories, [])).toEqual([]);
  });

  it("no categories → empty", () => {
    const config = { ...DEFAULT_CONFIG, finalGoalDate: goal };
    expect(generateStudyPlan(config, [], [])).toEqual([]);
  });

  it("allocates days proportional to weighted sections", () => {
    const config = {
      ...DEFAULT_CONFIG,
      finalGoalDate: goal,
      bufferPercent: 0,
      subjectOrder: ["cat-a", "cat-b"],
      hardSubjects: ["cat-b"],
    };
    const cards = [
      makeCard({ categoryId: "cat-a", sections: [makeSection(), makeSection()] }),
      makeCard({
        categoryId: "cat-b",
        subcategoryId: "sub-x",
        sections: [makeSection({ lastReviewed: Date.now() }), makeSection(), makeSection()],
      }),
    ];
    const plans = generateStudyPlan(config, categories, cards);
    expect(plans).toHaveLength(2);
    expect(plans[0].categoryName).toBe("Pravo");
    expect(plans[1].weight).toBe(1.5);
    expect(plans[1].learnedSections).toBe(1);
    expect(plans[1].totalSections).toBe(3);
    expect(plans[0].allocatedDays + plans[1].allocatedDays).toBeGreaterThan(0);
    expect(plans[0].endDate.getTime()).toBeLessThanOrEqual(plans[1].startDate.getTime() + 86400000);
  });

  it("builds subcategory units", () => {
    const config = { ...DEFAULT_CONFIG, finalGoalDate: goal, subjectOrder: ["cat-a"] };
    const cards = [
      makeCard({ categoryId: "cat-a", subcategoryId: "sub-1", sections: [makeSection()] }),
      makeCard({ categoryId: "cat-a", sections: [makeSection()] }),
    ];
    const plans = generateStudyPlan(config, categories, cards);
    expect(plans[0].units.length).toBeGreaterThanOrEqual(2);
  });
});

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
