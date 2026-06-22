import { describe, it, expect } from "vitest";
import { SectionState } from "@/lib/spaced-repetition";
import { healSectionLastReviewed, healCardFsrsSections } from "@/lib/migrations/heal-fsrs-sections";
import { makeCard } from "@/test/factories";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("heal-fsrs-sections", () => {
  it("infers lastReviewed from elapsedDays", () => {
    const section = {
      id: "s1",
      title: "T",
      contentDoc: { version: 4 as const, content: { type: "doc" as const, content: [] } },
      state: SectionState.Review,
      stability: 10,
      difficulty: 5,
      interval: 10,
      nextReview: NOW - DAY,
      lastReviewed: null,
      lapses: 0,
      elapsedDays: 5,
      scheduledDays: 10,
      firstReviewPending: false,
    };
    const healed = healSectionLastReviewed(section, NOW);
    expect(healed.lastReviewed).toBe(NOW - 5 * DAY);
  });

  it("heals cards with missing lastReviewed on non-New sections", () => {
    const card = makeCard({
      sections: [{
        id: "s1",
        state: SectionState.Review,
        nextReview: NOW - DAY,
        lastReviewed: null,
        elapsedDays: 3,
      }],
    });
    const healed = healCardFsrsSections(card, NOW);
    expect(healed.sections[0].lastReviewed).not.toBeNull();
  });
});
