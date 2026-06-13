import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mergeSubjectOverrides,
  OVERRIDABLE_SUBJECT_KEYS,
  resolveEffectiveSrParams,
  saveSubjectSettings,
  clearSubjectSettings,
} from "@/domains/subjects/subject-settings";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";

vi.mock("@/lib/app-settings", () => ({
  loadAppSettings: () => ({ targetRetention: 0.95 }),
}));

vi.mock("@/lib/db/queries", () => ({
  putSetting: vi.fn().mockResolvedValue(undefined),
  deleteSetting: vi.fn(() => Promise.resolve()),
  listSettingsByPrefix: vi.fn().mockResolvedValue([]),
}));

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

describe("resolveEffectiveSrParams", () => {
  const categoryId = "test-cat-override";

  afterEach(() => {
    clearSubjectSettings(categoryId);
  });

  it("returns global settings when no subject override exists", () => {
    const global = { ...DEFAULT_SR_SETTINGS, leechThreshold: 7 };
    const resolved = resolveEffectiveSrParams(categoryId, global);
    expect(resolved.targetRetention).toBe(0.95);
    expect(resolved.srSettings.leechThreshold).toBe(7);
  });

  it("merges subject targetRetention and srSettings fields", () => {
    void saveSubjectSettings(categoryId, {
      targetRetention: 0.88,
      leechThreshold: 3,
      dailyGoal: 40,
    });
    const global = { ...DEFAULT_SR_SETTINGS };
    const resolved = resolveEffectiveSrParams(categoryId, global);
    expect(resolved.targetRetention).toBe(0.88);
    expect(resolved.srSettings.leechThreshold).toBe(3);
    expect(resolved.srSettings.dailyGoal).toBe(40);
    expect(resolved.srSettings.resistanceWeights).toEqual(global.resistanceWeights);
  });
});
