import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startOfDay, subDays } from "date-fns";
import { buildChartBundle } from "./charts";
import { makeCard, makeSection } from "@/test/factories";
import { SectionState } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";

const FIXED_NOW = new Date("2026-06-13T12:00:00");

function reviewEntry(
  partial: Partial<ReviewLogEntry> & Pick<ReviewLogEntry, "cardId" | "sectionId">,
): ReviewLogEntry {
  return {
    timestamp: FIXED_NOW.getTime(),
    grade: 3,
    category: "cat-a",
    ...partial,
  };
}

describe("buildChartBundle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 14-day activity series", () => {
    const bundle = buildChartBundle([], [], 20);
    expect(bundle.activityData).toHaveLength(14);
    expect(bundle.ratioHistory).toHaveLength(14);
  });

  it("counts reviews and newly created cards per day", () => {
    const todayStart = startOfDay(FIXED_NOW).getTime();
    const card = makeCard({ createdAt: todayStart + 3600000, categoryId: "cat-a" });
    const log = [
      reviewEntry({
        cardId: card.id,
        sectionId: card.sections[0].id,
        timestamp: todayStart + 7200000,
      }),
    ];

    const bundle = buildChartBundle([card], log, 20);
    const todayKey = bundle.activityData.at(-1)!;

    expect(todayKey.Ponavljanja).toBe(1);
    expect(todayKey["Nove kartice"]).toBe(1);
  });

  it("buckets section scores into mastery distribution", () => {
    const newSec = makeSection();
    const learningSec = makeSection({
      html: "<p>x</p>",
      lastReviewed: Date.now(),
    });
    learningSec.state = SectionState.Learning;
    learningSec.stability = 1;
    learningSec.difficulty = 8;

    const masteredSec = makeSection({ html: "<p>x</p>", lastReviewed: Date.now() });
    masteredSec.state = SectionState.Review;
    masteredSec.stability = 30;
    masteredSec.difficulty = 2;

    const card = makeCard({ sections: [newSec, learningSec, masteredSec] });
    const bundle = buildChartBundle([card], [], 20);

    const byName = Object.fromEntries(bundle.masteryData.map((d) => [d.name, d.value]));
    expect(byName.Novo).toBe(1);
    expect(byName["Učenje"]).toBe(1);
    expect(byName.Savladano).toBe(1);
    expect(bundle.masteryData.find((d) => d.name === "Napredno")).toBeUndefined();
  });

  it("classifies repeat vs first-time reviews in ratio history", () => {
    const todayStart = startOfDay(FIXED_NOW).getTime();
    const yesterday = subDays(FIXED_NOW, 1).getTime();
    const cardA = makeCard({ id: "card-a", categoryId: "cat-a" });
    const cardB = makeCard({ id: "card-b", categoryId: "cat-a" });
    const secA = cardA.sections[0].id;
    const secB = cardB.sections[0].id;

    const log: ReviewLogEntry[] = [
      reviewEntry({ cardId: "card-a", sectionId: secA, timestamp: yesterday }),
      reviewEntry({ cardId: "card-a", sectionId: secA, timestamp: todayStart + 1000 }),
      reviewEntry({ cardId: "card-b", sectionId: secB, timestamp: todayStart + 2000 }),
    ];

    const bundle = buildChartBundle([cardA, cardB], log, 42);
    const today = bundle.ratioHistory.at(-1)!;

    expect(today["Idealni cilj"]).toBe(42);
    expect(today["Stvarni ponavljanje"]).toBe(50);
  });

  it("returns null review ratio for days without activity", () => {
    const bundle = buildChartBundle([], [], 15);
    expect(bundle.ratioHistory.every((d) => d["Stvarni ponavljanje"] === null)).toBe(true);
  });

  it("aggregates card mastery levels into levelCounts", () => {
    const fresh = makeCard({ id: "fresh" });
    const critical = makeCard({
      id: "critical",
      errorLog: [{ text: "x", count: 4, recentSuccesses: 0, successStreak: 0, lastMissed: "" }],
      sections: [
        (() => {
          const s = makeSection({ lastReviewed: Date.now() });
          s.state = SectionState.Review;
          s.stability = 2;
          s.difficulty = 5;
          return s;
        })(),
      ],
    });
    const mastered = makeCard({
      id: "mastered",
      sections: [
        (() => {
          const s = makeSection({ lastReviewed: Date.now() });
          s.state = SectionState.Review;
          s.stability = 40;
          s.difficulty = 2;
          return s;
        })(),
      ],
    });

    const bundle = buildChartBundle([fresh, critical, mastered], [], 20);

    expect(bundle.levelCounts).toHaveLength(6);
    expect(bundle.levelCounts[0]).toBe(1);
    expect(bundle.levelCounts[1]).toBe(1);
    expect(bundle.levelCounts[5]).toBe(1);
    expect(bundle.levelCounts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
