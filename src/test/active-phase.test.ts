import { describe, it, expect } from "vitest";
import { resolveActivePhaseFromPlans } from "@/lib/dashboard/active-phase";

describe("resolveActivePhaseFromPlans", () => {
  it("returns null for an empty plan list", () => {
    expect(resolveActivePhaseFromPlans([])).toBeNull();
  });

  it("picks the first incomplete subject", () => {
    const result = resolveActivePhaseFromPlans([
      { categoryName: "Gotovo", pct: 100, learnedSections: 10, totalSections: 10 },
      { categoryName: "U toku", pct: 40, learnedSections: 4, totalSections: 10 },
      { categoryName: "Drugo", pct: 20, learnedSections: 2, totalSections: 10 },
    ]);

    expect(result).toEqual({
      name: "U toku",
      pct: 40,
      learned: 4,
      total: 10,
    });
  });

  it("falls back to the first plan when all are complete", () => {
    const result = resolveActivePhaseFromPlans([
      { categoryName: "Prvi", pct: 100, learnedSections: 5, totalSections: 5 },
      { categoryName: "Drugi", pct: 100, learnedSections: 8, totalSections: 8 },
    ]);

    expect(result).toEqual({
      name: "Prvi",
      pct: 100,
      learned: 5,
      total: 5,
    });
  });
});
