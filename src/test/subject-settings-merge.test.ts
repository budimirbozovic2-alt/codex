import { describe, it, expect } from "vitest";
import { mergeSubjectOverrides, OVERRIDABLE_SUBJECT_KEYS } from "@/domains/subjects/subject-settings";

describe("mergeSubjectOverrides (Phase C / P2-3)", () => {
  const base = {
    leechThreshold: 5,
    dailyGoal: 20,
    targetRetention: 0.95,
    resistanceWeights: { lapses: 40, latency: 30, forgetting: 30 },
  };

  it("returns base when overrides is null/undefined", () => {
    expect(mergeSubjectOverrides(base, null)).toEqual(base);
    expect(mergeSubjectOverrides(base, undefined)).toEqual(base);
  });

  it("applies only defined override fields", () => {
    const merged = mergeSubjectOverrides(base, { leechThreshold: 9 });
    expect(merged.leechThreshold).toBe(9);
    expect(merged.dailyGoal).toBe(20);
    expect(merged.targetRetention).toBe(0.95);
  });

  it("ignores undefined override values (does not blank out base)", () => {
    const merged = mergeSubjectOverrides(base, { leechThreshold: undefined, dailyGoal: 42 });
    expect(merged.leechThreshold).toBe(5);
    expect(merged.dailyGoal).toBe(42);
  });

  it("exposes a stable list of overridable keys", () => {
    expect(OVERRIDABLE_SUBJECT_KEYS).toContain("targetRetention");
    expect(OVERRIDABLE_SUBJECT_KEYS).toContain("leechThreshold");
    expect(OVERRIDABLE_SUBJECT_KEYS).toContain("dailyGoal");
    expect(OVERRIDABLE_SUBJECT_KEYS).toContain("resistanceWeights");
  });
});
