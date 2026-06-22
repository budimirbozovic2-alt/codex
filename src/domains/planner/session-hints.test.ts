import { describe, it, expect, beforeEach } from "vitest";
import { addDays } from "date-fns";
import {
  computePlannerSessionHints,
  capQueueLength,
} from "./session-hints";
import { DEFAULT_CONFIG } from "./types";
import { plannerCache } from "./cache";
import type { CategoryRecord } from "@/lib/db-types";
import { makeCard, makeSection } from "@/test/factories";
import { FIXED_NOW, installFixedPlannerClock } from "./planner-test-clock";

installFixedPlannerClock();

const categories: CategoryRecord[] = [
  { id: "cat-a", name: "Pravo", sortOrder: 0, subcategories: [] },
];

const goal = addDays(FIXED_NOW, 30).toISOString().slice(0, 10);

beforeEach(() => {
  plannerCache.set({
    ...DEFAULT_CONFIG,
    finalGoalDate: goal,
    dailyAvailableMinutes: 120,
  });
});

describe("computePlannerSessionHints", () => {
  it("disabled without goal", () => {
    plannerCache.set({ ...DEFAULT_CONFIG, finalGoalDate: null });
    const hints = computePlannerSessionHints({
      cards: [],
      reviewLog: [],
      categoryRecords: categories,
      dueCount: 0,
    });
    expect(hints.enabled).toBe(false);
  });

  it("returns learn and review remaining from snapshot", () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      makeCard({
        id: `c-${i}`,
        categoryId: "cat-a",
        sections: [makeSection({ lastReviewed: null })],
      }),
    );
    const hints = computePlannerSessionHints({
      cards,
      reviewLog: [],
      categoryRecords: categories,
      dueCount: 3,
      scopedDueCount: 3,
    });
    expect(hints.enabled).toBe(true);
    expect(hints.learnRemaining).toBeGreaterThan(0);
    expect(hints.reviewRemaining).toBeGreaterThanOrEqual(0);
    expect(hints.focusCategoryName).toBe("Pravo");
  });

  it("shrinks learn remaining after today's progress", () => {
    const card = makeCard({
      categoryId: "cat-a",
      sections: [makeSection(), makeSection()],
    });
    const day = "2026-06-15";
    const noon = new Date(`${day}T12:00:00.000Z`).getTime();
    const hints = computePlannerSessionHints({
      cards: [card],
      reviewLog: [
        { cardId: card.id, sectionId: card.sections[0].id, grade: 3, timestamp: noon, category: "cat-a" },
      ],
      categoryRecords: categories,
      dueCount: 0,
    });
    expect(hints.dailyProgress).toBe(1);
    expect(hints.learnRemaining).toBeLessThan(hints.learnTarget);
  });
});

describe("capQueueLength", () => {
  it("no cap when planner disabled", () => {
    expect(capQueueLength(50, 0, false)).toBe(50);
  });

  it("caps to remaining budget", () => {
    expect(capQueueLength(50, 8, true)).toBe(8);
  });

  it("zero remaining yields empty queue", () => {
    expect(capQueueLength(50, 0, true)).toBe(0);
  });
});
