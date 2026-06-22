import { describe, it, expect } from "vitest";
import { SectionState } from "@/lib/spaced-repetition";
import { makeCard } from "@/test/factories";
import {
  resetCardLearningProgress,
  resetSectionLearningProgress,
} from "@/lib/reset/reset-section-progress";

const NOW = 1_700_000_000_000;

describe("reset-section-progress", () => {
  it("resets FSRS fields but keeps contentDoc and title", () => {
    const section = {
      id: "sec-1",
      title: "Odgovor",
      contentDoc: { version: 4 as const, content: { type: "doc" as const, content: [] } },
      state: SectionState.Review,
      stability: 12,
      difficulty: 7,
      interval: 10,
      nextReview: NOW - 1000,
      lastReviewed: NOW - 5000,
      lapses: 2,
      elapsedDays: 3,
      scheduledDays: 10,
      firstReviewPending: false,
    };
    const next = resetSectionLearningProgress(section, NOW);
    expect(next.id).toBe("sec-1");
    expect(next.title).toBe("Odgovor");
    expect(next.contentDoc).toBe(section.contentDoc);
    expect(next.state).toBe(SectionState.New);
    expect(next.lastReviewed).toBeNull();
    expect(next.lapses).toBe(0);
  });

  it("resets card readCount and errorLog", () => {
    const card = makeCard({
      readCount: 5,
      errorLog: [{ text: "x", count: 1, recentSuccesses: 0, successStreak: 0, lastMissed: "d" }],
      sections: [{ id: "s1", state: SectionState.Review, nextReview: NOW - 1 }],
    });
    const next = resetCardLearningProgress(card, NOW);
    expect(next.question).toBe(card.question);
    expect(next.categoryId).toBe(card.categoryId);
    expect(next.readCount).toBe(0);
    expect(next.errorLog).toEqual([]);
    expect(next.sections[0].state).toBe(SectionState.New);
  });
});
