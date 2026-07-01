/**
 * TD-ARCH-9 — main-thread analytics profiling.
 * Documents `_pure` compute budget at scale (fixture build excluded from timing).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";
import { buildChartBundle } from "@/lib/analytics/_pure/charts";
import { calcInterferencePairs } from "@/lib/analytics/_pure/interference";
import { calcResistance } from "@/lib/analytics/_pure/resistance";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";

/** Loose ceilings for CI / Windows jsdom — not perf targets (dev ~120ms @ 20k). */
const BUDGET_BY_N: Record<number, number> = {
  5_000: 250,
  10_000: 400,
  20_000: 500,
};
const CATEGORIES = ["cat-a", "cat-b", "cat-c", "cat-d", "cat-e"];

function makeBenchCard(i: number): Card {
  const cat = CATEGORIES[i % CATEGORIES.length]!;
  return {
    id: `bench-${i}`,
    question: `Question ${i}?`,
    categoryId: cat,
    createdAt: 1_700_000_000_000 + i * 1000,
    updatedAt: 1_700_000_000_000 + i * 1000,
    type: "essay",
    sections: [
      {
        id: `sec-${i}`,
        title: "Cjelina",
        contentDoc: { type: "doc", content: [{ type: "paragraph" }] },
        state: SectionState.New,
        stability: 0,
        difficulty: 0,
        interval: 0,
        nextReview: 0,
        lastReviewed: null,
        lapses: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        firstReviewPending: true,
      },
    ],
  } as Card;
}

function makeReviewLog(cards: readonly Card[]): ReviewLogEntry[] {
  return cards.slice(0, 500).map((c, i) => ({
    cardId: c.id,
    sectionId: c.sections[0]!.id,
    timestamp: Date.now() - i * 60_000,
    grade: 3 as const,
    category: c.categoryId,
  }));
}

let cards20k: Card[] = [];
let reviewLog20k: ReviewLogEntry[] = [];

describe("analytics main-thread bench (TD-ARCH-9)", () => {
  beforeAll(() => {
    cards20k = Array.from({ length: 20_000 }, (_, i) => makeBenchCard(i));
    reviewLog20k = makeReviewLog(cards20k);
  }, 60_000);

  for (const n of [5_000, 10_000, 20_000] as const) {
    it(`buildChartBundle @ ${n} cards < ${BUDGET_BY_N[n]}ms`, () => {
      const cards = cards20k.slice(0, n);
      const reviewLog = reviewLog20k.slice(0, Math.min(n, 500));
      const t0 = performance.now();
      buildChartBundle(cards, reviewLog, 25);
      const ms = performance.now() - t0;
      console.log(`[analytics-bench] buildChartBundle n=${n}: ${ms.toFixed(1)}ms`);
      expect(ms).toBeLessThan(BUDGET_BY_N[n]);
    });
  }

  it("calcResistance @ 20k cards < 100ms", () => {
    const weights = DEFAULT_SR_SETTINGS.resistanceWeights;
    const weightsByCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c, weights]),
    );
    const t0 = performance.now();
    calcResistance(
      cards20k,
      CATEGORIES,
      reviewLog20k,
      [],
      weightsByCategory,
      weights,
    );
    const ms = performance.now() - t0;
    console.log(`[analytics-bench] calcResistance n=20000: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });

  it("calcInterferencePairs @ 20k cards < 100ms", () => {
    const t0 = performance.now();
    calcInterferencePairs(cards20k, 10);
    const ms = performance.now() - t0;
    console.log(`[analytics-bench] calcInterferencePairs n=20000: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(100);
  });
});
