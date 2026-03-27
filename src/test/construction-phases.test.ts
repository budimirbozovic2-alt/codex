import { describe, it, expect } from "vitest";
import { calculateForumState } from "@/lib/forum-logic";
import type { Card } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";

/**
 * Helper: generates N cards for a category where `masteryPct`% of sections
 * are in Review state and the rest are New.
 */
function makeCards(category: string, total: number, masteryPct: number): Card[] {
  const cards: Card[] = [];
  const sectionsPerCard = 4;
  const totalSections = total * sectionsPerCard;
  const reviewCount = Math.round((masteryPct / 100) * totalSections);
  let reviewsPlaced = 0;

  for (let i = 0; i < total; i++) {
    const sections = Array.from({ length: sectionsPerCard }, (_, s) => {
      const isReview = reviewsPlaced < reviewCount;
      if (isReview) reviewsPlaced++;
      return {
        id: `${category}-${i}-s${s}`,
        title: `Section ${s}`,
        content: "test",
        state: isReview ? SectionState.Review : SectionState.New,
        stability: isReview ? 30 : 0,
        difficulty: 5,
        interval: isReview ? 7 : 0,
        nextReview: Date.now(),
        lastReviewed: isReview ? Date.now() - 86400000 : null,
        lapses: 0,
        elapsedDays: 1,
        scheduledDays: 7,
        firstReviewPending: false,
      };
    });
    cards.push({
      id: `${category}-card-${i}`,
      question: `Q ${i}`,
      sections,
      category,
      createdAt: Date.now(),
      readCount: 0,
      type: "essay",
    });
  }
  return cards;
}

describe("Construction Phase System", () => {
  const scenarios: { mastery: number; expectedPhase: string; label: string }[] = [
    { mastery: 5,  expectedPhase: "foundation",   label: "Temelji" },
    { mastery: 20, expectedPhase: "skeleton",      label: "Skele" },
    { mastery: 45, expectedPhase: "construction",  label: "Građenje" },
    { mastery: 75, expectedPhase: "complete",      label: "Kompletna" },
    { mastery: 95, expectedPhase: "imperial",      label: "Imperijalna" },
  ];

  scenarios.forEach(({ mastery, expectedPhase, label }) => {
    it(`${mastery}% mastery → "${expectedPhase}" (${label})`, () => {
      const cards = makeCards(`Test-${mastery}`, 20, mastery);
      const state = calculateForumState(cards, []);
      const monument = state.monuments.find(m => m.category === `Test-${mastery}`);

      expect(monument).toBeDefined();
      expect(monument!.material).toBe(expectedPhase);
      // Mastery should be approximately correct (within rounding)
      expect(monument!.mastery).toBeCloseTo(mastery, 0);
    });
  });

  it("boundary: 0% → foundation", () => {
    const cards = makeCards("Zero", 5, 0);
    const state = calculateForumState(cards, []);
    expect(state.monuments[0].material).toBe("foundation");
  });

  it("boundary: 10% → foundation (exclusive)", () => {
    const cards = makeCards("Ten", 10, 10);
    const state = calculateForumState(cards, []);
    expect(state.monuments[0].material).toBe("foundation");
  });

  it("boundary: 11% → skeleton", () => {
    const cards = makeCards("Eleven", 100, 11);
    const state = calculateForumState(cards, []);
    expect(state.monuments[0].material).toBe("skeleton");
  });

  it("boundary: 91% → imperial", () => {
    const cards = makeCards("NinetyOne", 100, 91);
    const state = calculateForumState(cards, []);
    expect(state.monuments[0].material).toBe("imperial");
  });

  it("boundary: 100% → imperial", () => {
    const cards = makeCards("Full", 10, 100);
    const state = calculateForumState(cards, []);
    expect(state.monuments[0].material).toBe("imperial");
    expect(state.monuments[0].mastery).toBe(100);
  });

  it("multiple categories sort by mastery descending", () => {
    const allCards = [
      ...makeCards("Low", 10, 10),
      ...makeCards("High", 10, 90),
      ...makeCards("Mid", 10, 50),
    ];
    const state = calculateForumState(allCards, []);
    expect(state.monuments[0].category).toBe("High");
    expect(state.monuments[state.monuments.length - 1].category).toBe("Low");
  });

  it("empty cards → foundation with 0 mastery", () => {
    const state = calculateForumState([], []);
    expect(state.monuments).toHaveLength(0);
    expect(state.overallMastery).toBe(0);
  });

  it("leech detection sets crumbling when ratio > 0.2", () => {
    const cards = makeCards("Leech", 5, 50);
    // Set lapses >= 5 on more than 20% of sections
    let count = 0;
    for (const card of cards) {
      for (const sec of card.sections) {
        if (count < 5) { sec.lapses = 6; count++; }
      }
    }
    const state = calculateForumState(cards, []);
    const m = state.monuments.find(m => m.category === "Leech")!;
    expect(m.leechCount).toBe(5);
    expect(m.crumbling).toBe(true);
  });
});
