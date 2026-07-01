/**
 * Smoke test for main-thread analyticsClient (TD-ARCH-9).
 */
import { describe, it, expect } from "vitest";
import { analyticsClient } from "@/lib/analytics/analyticsClient";
import { buildChartBundle } from "@/lib/analytics/_pure/charts";
import { calcInterferencePairs } from "@/lib/analytics/_pure/interference";
import { makeCard } from "./factories";

describe("analyticsClient (main thread)", () => {
  it("buildCharts matches _pure equivalent", () => {
    const cards = [
      makeCard({ id: "a", categoryId: "cat1", question: "Q1", sourceType: "skripta", errorLog: [] }),
      makeCard({ id: "b", categoryId: "cat1", question: "Q2", sourceType: "skripta", errorLog: [] }),
    ];
    const expected = buildChartBundle(cards, [], 5);
    const got = analyticsClient.buildCharts(cards, [], 5);
    expect(got).toEqual(expected);
  });

  it("runInterference matches _pure equivalent", () => {
    const cards = [
      makeCard({ id: "a", categoryId: "cat1", question: "Q1", sourceType: "skripta", errorLog: [] }),
    ];
    const expected = calcInterferencePairs(cards, 10);
    const got = analyticsClient.runInterference(cards, 10);
    expect(got).toEqual(expected);
  });

  it("runRecovery returns null on empty discipline log", () => {
    const result = analyticsClient.runRecovery();
    expect(result).toBeNull();
  });
});
