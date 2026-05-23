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
import { SectionState } from "@/lib/spaced-repetition";

function makeCard(id: string, categoryId: string, question: string): Card {
  return {
    id,
    question,
    sections: [{
      id: `${id}-s1`, title: "t", content: "c", state: SectionState.New,
      stability: 0, difficulty: 5, interval: 0, nextReview: 0,
      lastReviewed: null, lapses: 0, elapsedDays: 0, scheduledDays: 0,
      firstReviewPending: true,
    }],
    categoryId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceType: "skripta",
    errorLog: [],
  } as unknown as Card;
}

describe("analyticsClient (sync fallback)", () => {
  it("buildCharts matches _pure equivalent", async () => {
    const cards = [makeCard("a", "cat1", "Q1"), makeCard("b", "cat1", "Q2")];
    const expected = buildChartBundle(cards, [], 5);
    const got = await analyticsClient.buildCharts(cards, [], 5);
    expect(got).toEqual(expected);
  });

  it("runInterference matches _pure equivalent", async () => {
    const cards = [makeCard("a", "cat1", "Q1")];
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
