/**
 * Smoke test for the analytics-worker sync fallback path.
 *
 * In the vitest env `typeof Worker === "undefined"` (happy-dom), so the
 * client should execute the `_pure` modules in-band and return identical
 * results to calling them directly.
 */
import { describe, it, expect } from "vitest";
import { analyticsClient } from "@/lib/analytics/workerClient";
import { buildChartBundle } from "@/lib/analytics/_pure/charts";
import { calcInterferencePairs } from "@/lib/analytics/_pure/interference";
import type { Card } from "@/lib/spaced-repetition";
import { makeCard } from "./factories";

describe("analyticsClient (sync fallback)", () => {
  it("buildCharts matches _pure equivalent", async () => {
    const cards = [
      makeCard({ id: "a", categoryId: "cat1", question: "Q1", sourceType: "skripta", errorLog: [] }),
      makeCard({ id: "b", categoryId: "cat1", question: "Q2", sourceType: "skripta", errorLog: [] }),
    ];
    const expected = buildChartBundle(cards, [], 5);
    const got = await analyticsClient.buildCharts(cards, [], 5);
    expect(got).toEqual(expected);
  });

  it("runInterference matches _pure equivalent", async () => {
    const cards = [
      makeCard({ id: "a", categoryId: "cat1", question: "Q1", sourceType: "skripta", errorLog: [] }),
    ];
    const expected = calcInterferencePairs(cards, 10);
    const got = await analyticsClient.runInterference(cards, 10);
    expect(got).toEqual(expected);
  });

  it("runRecovery returns null on empty discipline log", async () => {
    const result = await analyticsClient.runRecovery();
    // With no discipline log seeded, the pure callee returns null.
    expect(result).toBeNull();
  });
});
