import { beforeEach, describe, it, expect, vi } from "vitest";
import { scrubCategoryFromPlannerConfig } from "./scrub";
import { loadPlanner } from "./config";
import { plannerCache } from "./cache";
import { DEFAULT_CONFIG } from "./types";

vi.mock("@/lib/db/queries", () => ({
  savePlannerConfig: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  plannerCache.set({
    ...DEFAULT_CONFIG,
    subjectOrder: ["cat-a", "cat-b"],
    hardSubjects: ["cat-a"],
    phases: [{
      id: "p1",
      name: "Faza",
      expectedDays: 14,
      categories: ["cat-a", "cat-c"],
    }],
  });
});

describe("scrubCategoryFromPlannerConfig", () => {
  it("returns false when category is not referenced", () => {
    expect(scrubCategoryFromPlannerConfig("cat-z")).toBe(false);
    expect(loadPlanner().subjectOrder).toEqual(["cat-a", "cat-b"]);
  });

  it("removes category from subjectOrder, hardSubjects, and phases", () => {
    expect(scrubCategoryFromPlannerConfig("cat-a")).toBe(true);
    const cfg = loadPlanner();
    expect(cfg.subjectOrder).toEqual(["cat-b"]);
    expect(cfg.hardSubjects).toEqual([]);
    expect(cfg.phases![0].categories).toEqual(["cat-c"]);
  });
});
