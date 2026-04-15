import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateInterval,
  calculateNextReview,
  formatInterval,
  isLeech,
  getRetrievability,
  getSectionScore,
  getCardScore,
  getDueCards,
  getDueSections,
  
  createSection,
  SectionState,
  Section,
  Card,
  DEFAULT_SR_SETTINGS,
} from "@/lib/spaced-repetition";

// ─── Helpers ─────────────────────────────────────────────

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    ...createSection("Test", "Content"),
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: crypto.randomUUID(),
    question: "Test?",
    sections: [makeSection()],
    categoryId: "cat-1",
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
    ...overrides,
  };
}

// ─── calculateInterval ──────────────────────────────────

describe("calculateInterval", () => {
  it("returns 0 for stability <= 0", () => {
    expect(calculateInterval(0)).toBe(0);
    expect(calculateInterval(-5)).toBe(0);
  });

  it("uses custom targetRetention", () => {
    const i90 = calculateInterval(10, 0.9);
    const i95 = calculateInterval(10, 0.95);
    // lower retention → longer interval
    expect(i90).toBeGreaterThan(i95);
  });

  it("returns positive for positive stability", () => {
    expect(calculateInterval(5, 0.9)).toBeGreaterThan(0);
  });

  it("higher stability → longer interval", () => {
    expect(calculateInterval(20, 0.9)).toBeGreaterThan(calculateInterval(5, 0.9));
  });
});

// ─── calculateNextReview (state machine) ─────────────────

describe("calculateNextReview", () => {
  it("New + grade 1 → Learning, stability 0.1, lapses +1", () => {
    const s = makeSection({ state: SectionState.New });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.state).toBe(SectionState.Learning);
    expect(r.stability).toBe(0.1);
    expect(r.lapses).toBe(1);
  });

  it("New + grade 3 → Learning + firstReviewPending, 15min delay", () => {
    const s = makeSection({ state: SectionState.New });
    const before = Date.now();
    const r = calculateNextReview(s, 3, 0.9);
    expect(r.state).toBe(SectionState.Learning);
    expect(r.firstReviewPending).toBe(true);
    // ~15 min delay
    const delayMs = r.nextReview! - before;
    expect(delayMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(delayMs).toBeLessThanOrEqual(16 * 60 * 1000);
  });

  it("New + grade 4 → Learning + firstReviewPending, 20min delay", () => {
    const s = makeSection({ state: SectionState.New });
    const before = Date.now();
    const r = calculateNextReview(s, 4, 0.9);
    expect(r.state).toBe(SectionState.Learning);
    expect(r.firstReviewPending).toBe(true);
    const delayMs = r.nextReview! - before;
    expect(delayMs).toBeGreaterThanOrEqual(19 * 60 * 1000);
    expect(delayMs).toBeLessThanOrEqual(21 * 60 * 1000);
  });

  it("Learning + grade 1 → stays Learning", () => {
    const s = makeSection({ state: SectionState.Learning, stability: 1, difficulty: 5, lastReviewed: Date.now() - 3600000 });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.state).toBe(SectionState.Learning);
    expect(r.lapses).toBe(1);
  });

  it("Learning + grade 3 → Review", () => {
    const s = makeSection({ state: SectionState.Learning, stability: 1, difficulty: 5, lastReviewed: Date.now() - 3600000 });
    const r = calculateNextReview(s, 3, 0.9);
    expect(r.state).toBe(SectionState.Review);
  });

  it("Review + grade 1 → Relearning, stability * 0.05, lapses +1, 20min", () => {
    const s = makeSection({ state: SectionState.Review, stability: 10, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const before = Date.now();
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.state).toBe(SectionState.Relearning);
    expect(r.stability).toBeCloseTo(0.5, 1);
    expect(r.lapses).toBe(1);
    const delayMs = r.nextReview! - before;
    expect(delayMs).toBeGreaterThanOrEqual(19 * 60 * 1000);
    expect(delayMs).toBeLessThanOrEqual(21 * 60 * 1000);
  });

  it("Review + grade 2 → Review, stability * 0.3, max 24h", () => {
    const s = makeSection({ state: SectionState.Review, stability: 10, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 2, 0.9);
    expect(r.state).toBe(SectionState.Review);
    expect(r.stability).toBeCloseTo(3, 1);
    const delayMs = r.nextReview! - Date.now();
    expect(delayMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  it("Review + grade 3 → stability * 3 + 1", () => {
    const s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 3, 0.9);
    expect(r.stability).toBe(16);
  });

  it("Review + grade 4 → stability * 5 + 2, difficulty -1", () => {
    const s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 4, 0.9);
    expect(r.stability).toBe(27);
    expect(r.difficulty).toBe(4);
  });

  it("firstReviewPending + grade >= 3 → Review, pending=false", () => {
    const s = makeSection({ state: SectionState.Learning, stability: 3, difficulty: 4, firstReviewPending: true, lastReviewed: Date.now() - 900000 });
    const r = calculateNextReview(s, 3, 0.9);
    expect(r.state).toBe(SectionState.Review);
    expect(r.firstReviewPending).toBe(false);
  });

  it("firstReviewPending + grade < 3 → Learning, 10min, pending=true", () => {
    const s = makeSection({ state: SectionState.Learning, stability: 3, difficulty: 4, firstReviewPending: true, lastReviewed: Date.now() - 900000 });
    const before = Date.now();
    const r = calculateNextReview(s, 2, 0.9);
    expect(r.state).toBe(SectionState.Learning);
    expect(r.firstReviewPending).toBe(true);
    const delayMs = r.nextReview! - before;
    expect(delayMs).toBeGreaterThanOrEqual(9 * 60 * 1000);
    expect(delayMs).toBeLessThanOrEqual(11 * 60 * 1000);
  });

  it("difficulty clamped to [1, 10]", () => {
    const high = makeSection({ state: SectionState.Review, stability: 5, difficulty: 9.5, lastReviewed: Date.now() - 86400000 });
    const r1 = calculateNextReview(high, 1, 0.9); // +2
    expect(r1.difficulty).toBeLessThanOrEqual(10);

    const low = makeSection({ state: SectionState.Review, stability: 5, difficulty: 1.5, lastReviewed: Date.now() - 86400000 });
    const r2 = calculateNextReview(low, 4, 0.9); // -1
    expect(r2.difficulty).toBeGreaterThanOrEqual(1);
  });
});

// ─── formatInterval ──────────────────────────────────────

describe("formatInterval", () => {
  it("< 1h → minutes", () => {
    expect(formatInterval(0.5 / 24)).toBe("30min");
  });

  it("< 1d → hours", () => {
    expect(formatInterval(0.5)).toBe("12h");
  });

  it("< 30d → days", () => {
    expect(formatInterval(15)).toBe("15d");
  });

  it("< 365d → months", () => {
    expect(formatInterval(90)).toBe("3mj");
  });

  it(">= 365d → years", () => {
    expect(formatInterval(730)).toBe("2.0g");
  });
});

// ─── isLeech ─────────────────────────────────────────────

describe("isLeech", () => {
  it("lapses >= threshold → true", () => {
    const s = makeSection({ lapses: 5 });
    expect(isLeech(s)).toBe(true);
  });

  it("lapses < threshold → false", () => {
    const s = makeSection({ lapses: 3 });
    expect(isLeech(s)).toBe(false);
  });

  it("custom threshold", () => {
    const s = makeSection({ lapses: 3 });
    expect(isLeech(s, { ...DEFAULT_SR_SETTINGS, leechThreshold: 3 })).toBe(true);
  });
});

// ─── getRetrievability ───────────────────────────────────

describe("getRetrievability", () => {
  it("New section → 0", () => {
    expect(getRetrievability(makeSection())).toBe(0);
  });

  it("stability <= 0 → 0", () => {
    expect(getRetrievability(makeSection({ state: SectionState.Review, stability: 0 }))).toBe(0);
  });

  it("just reviewed → ~100", () => {
    const s = makeSection({ state: SectionState.Review, stability: 10, lastReviewed: Date.now() });
    expect(getRetrievability(s)).toBeGreaterThanOrEqual(99);
  });

  it("elapsed time reduces value", () => {
    const s = makeSection({ state: SectionState.Review, stability: 1, lastReviewed: Date.now() - 5 * 86400000 });
    expect(getRetrievability(s)).toBeLessThan(10);
  });
});

// ─── getSectionScore / getCardScore ──────────────────────

describe("scores", () => {
  it("new section → 0", () => {
    expect(getSectionScore(makeSection())).toBe(0);
  });

  it("high stability + low difficulty → high score", () => {
    const s = makeSection({ state: SectionState.Review, stability: 30, difficulty: 1 });
    expect(getSectionScore(s)).toBeGreaterThanOrEqual(90);
  });

  it("getCardScore averages sections", () => {
    const card = makeCard({
      sections: [
        makeSection({ state: SectionState.Review, stability: 30, difficulty: 1 }),
        makeSection(), // New → 0
      ],
    });
    const score = getCardScore(card);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("empty sections → 0", () => {
    expect(getCardScore(makeCard({ sections: [] }))).toBe(0);
  });
});

// ─── getDueCards / getDueSections ────────────────────────

describe("due filtering", () => {
  it("getDueCards filters non-New with nextReview <= now", () => {
    const due = makeCard({
      sections: [makeSection({ state: SectionState.Review, nextReview: Date.now() - 1000 })],
    });
    const notDue = makeCard({
      sections: [makeSection({ state: SectionState.Review, nextReview: Date.now() + 999999 })],
    });
    const newCard = makeCard(); // New state
    const result = getDueCards([due, notDue, newCard]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(due.id);
  });

  it("getDueSections filters correctly", () => {
    const card = makeCard({
      sections: [
        makeSection({ state: SectionState.Review, nextReview: Date.now() - 1000 }),
        makeSection({ state: SectionState.New }),
        makeSection({ state: SectionState.Review, nextReview: Date.now() + 999999 }),
      ],
    });
    expect(getDueSections(card)).toHaveLength(1);
  });
});

// P1: getStats test removed — function replaced by inline single-pass in useCards.ts

// ─── Edge-case tests ─────────────────────────────────────

describe("difficulty clamping at boundaries", () => {
  it("grade 4 with difficulty=1 stays at 1", () => {
    const s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 1, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 4, 0.9);
    expect(r.difficulty).toBe(1);
  });

  it("grade 1 with difficulty=9 clamps to 10", () => {
    const s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 9, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.difficulty).toBe(10);
  });

  it("grade 1 with difficulty=10 stays at 10", () => {
    const s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 10, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.difficulty).toBe(10);
  });

  it("repeated grade 4 never drops below 1", () => {
    let s = makeSection({ state: SectionState.Review, stability: 5, difficulty: 2, lastReviewed: Date.now() - 86400000 });
    for (let i = 0; i < 10; i++) {
      const r = calculateNextReview(s, 4, 0.9);
      s = { ...s, ...r } as Section;
    }
    expect(s.difficulty).toBeGreaterThanOrEqual(1);
  });
});

describe("stability near zero", () => {
  it("grade 1 with stability=0.1 floors at 0.1", () => {
    const s = makeSection({ state: SectionState.Review, stability: 0.1, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.stability).toBeCloseTo(0.1, 1);
  });

  it("grade 2 with stability=0.1 floors at 0.2", () => {
    const s = makeSection({ state: SectionState.Review, stability: 0.1, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 2, 0.9);
    expect(r.stability).toBeCloseTo(0.2, 1);
  });

  it("grade 1 with stability=2 → max(0.1, 2*0.05=0.1) = 0.1", () => {
    const s = makeSection({ state: SectionState.Review, stability: 2, difficulty: 5, lastReviewed: Date.now() - 86400000 });
    const r = calculateNextReview(s, 1, 0.9);
    expect(r.stability).toBeCloseTo(0.1, 1);
  });
});

describe("interval extreme values", () => {
  it("very high stability (10000) → finite positive interval", () => {
    const interval = calculateInterval(10000, 0.9);
    expect(Number.isFinite(interval)).toBe(true);
    expect(interval).toBeGreaterThan(0);
  });

  it("targetRetention=1.0 → interval=0", () => {
    const interval = calculateInterval(10, 1.0);
    expect(Math.abs(interval)).toBe(0);
  });

  it("targetRetention=0.5 → much shorter than 0.95", () => {
    const i95 = calculateInterval(10, 0.95);
    const i50 = calculateInterval(10, 0.5);
    expect(i50).toBeGreaterThan(i95);
  });

  it("MAX_SAFE_INTEGER stability → no error, finite result", () => {
    const interval = calculateInterval(Number.MAX_SAFE_INTEGER, 0.9);
    expect(Number.isFinite(interval)).toBe(true);
  });
});

describe("retrievability edge cases", () => {
  it("tiny stability (0.001) after 1 day → near 0", () => {
    const s = makeSection({
      state: SectionState.Review, stability: 0.001,
      lastReviewed: Date.now() - 86400000,
    });
    expect(getRetrievability(s)).toBeLessThanOrEqual(1);
  });

  it("huge stability (10000) after 90 days → still ~100", () => {
    const s = makeSection({
      state: SectionState.Review, stability: 10000,
      lastReviewed: Date.now() - 90 * 86400000,
    });
    expect(getRetrievability(s)).toBeGreaterThanOrEqual(99);
  });
});

describe("score edge cases", () => {
  it("getSectionScore with stability=50 caps near 100", () => {
    const s = makeSection({ state: SectionState.Review, stability: 50, difficulty: 1 });
    const score = getSectionScore(s);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("getCardScore with empty sections → 0", () => {
    const card = makeCard({ sections: [] });
    expect(getCardScore(card)).toBe(0);
  });
});
