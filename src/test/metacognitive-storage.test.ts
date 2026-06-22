import { describe, it, expect, beforeEach } from "vitest";
import {
  addActivityEntry,
  loadCalibration,
  getCalibrationStats,
  getTimeDistribution,
  getLearningVelocity,
} from "@/domains/metacognition/metacognitive-storage";
import { resetTestSqliteState } from "@/test/sqlite-harness";

describe("metacognitive-storage", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("addActivityEntry feeds getTimeDistribution", () => {
    addActivityEntry({ timestamp: Date.now(), type: "learn-active", durationMs: 12_000 });
    const dist = getTimeDistribution(1);
    expect(dist.learning).toBeGreaterThan(0);
    expect(dist.totalMs).toBeGreaterThan(0);
  });

  it("getCalibrationStats aggregates calibration cache", () => {
    const stats = getCalibrationStats(loadCalibration());
    expect(stats).toHaveProperty("overconfident");
    expect(stats).toHaveProperty("underconfident");
    expect(stats).toHaveProperty("calibrated");
  });

  it("getLearningVelocity returns per-category velocity rows", () => {
    const velocity = getLearningVelocity([], ["cat-a"]);
    expect(velocity).toEqual([
      expect.objectContaining({ category: "cat-a", velocity: 0, masteredCount: 0 }),
    ]);
  });
});
