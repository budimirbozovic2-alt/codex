import { describe, it, expect } from "vitest";
import {
  buildStabilizationItems,
  buildCriticalItems,
  buildHardestItems,
  buildItemsForMode,
  isEarlyReview,
  HARDEST_DIFFICULT_GRACE_MS,
  HARDEST_LEECH_GRACE_MS,
  HARDEST_MAX_ITEMS,
} from "@/lib/review-mode-builder";
import {
  Card,
  Section,
  SectionState,
  DEFAULT_SR_SETTINGS,
} from "@/lib/spaced-repetition";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: crypto.randomUUID(),
    title: "S",
    content: "C",
    state: SectionState.Review,
    stability: 10,
    difficulty: 5,
    interval: 10,
    nextReview: NOW - DAY, // due by default
    lastReviewed: NOW - 11 * DAY,
    lapses: 0,
    elapsedDays: 11,
    scheduledDays: 10,
    firstReviewPending: false,
    ...overrides,
  };
}

function makeCard(sections: Section[]): Card {
  return {
    id: crypto.randomUUID(),
    question: "Q?",
    sections,
    categoryId: "cat-1",
    createdAt: NOW,
    readCount: 0,
    type: "essay",
  };
}

describe("review-mode-builder", () => {
  describe("buildStabilizationItems", () => {
    it("includes only Learning/Relearning sections with stability < 5", () => {
      const learning = makeSection({ state: SectionState.Learning, stability: 1 });
      const review = makeSection({ state: SectionState.Review, stability: 1 });
      const stable = makeSection({ state: SectionState.Learning, stability: 8 });
      const card = makeCard([learning, review, stable]);
      const items = buildStabilizationItems({
        dueCards: [card],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(1);
      expect(items[0].section.id).toBe(learning.id);
    });

    it("sorts by ascending stability", () => {
      const a = makeSection({ state: SectionState.Learning, stability: 3 });
      const b = makeSection({ state: SectionState.Learning, stability: 1 });
      const card = makeCard([a, b]);
      const items = buildStabilizationItems({
        dueCards: [card],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items.map(i => i.section.stability)).toEqual([1, 3]);
    });
  });

  describe("buildCriticalItems", () => {
    it("excludes sections that are not yet due (FSRS scheduling protection)", () => {
      // Section due in 5 days but with R in [80,85] — must NOT be included.
      const future = makeSection({
        nextReview: NOW + 5 * DAY,
        stability: 30,
        lastReviewed: NOW - 5 * DAY, // R ≈ exp(-5/30) ≈ 84.6%
      });
      const card = makeCard([future]);
      const items = buildCriticalItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(0);
    });

    it("includes due sections with retrievability in [80, 85]", () => {
      // getRetrievability uses real Date.now() internally for `elapsed`,
      // so anchor lastReviewed relative to it (not the test NOW constant).
      const realNow = Date.now();
      const eligible = makeSection({
        nextReview: realNow - DAY,
        stability: 30,
        lastReviewed: realNow - 5 * DAY, // R = exp(-5/30)*100 ≈ 84.6
      });
      const card = makeCard([eligible]);
      const items = buildCriticalItems({
        dueCards: [card],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: realNow,
      });
      expect(items.length).toBeGreaterThan(0);
    });

    it("excludes New sections", () => {
      const fresh = makeSection({ state: SectionState.New, nextReview: NOW - DAY });
      const card = makeCard([fresh]);
      const items = buildCriticalItems({
        dueCards: [card],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(0);
    });
  });

  describe("buildHardestItems", () => {
    it("includes leeches within their grace window", () => {
      const leech = makeSection({
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        nextReview: NOW + HARDEST_LEECH_GRACE_MS - DAY, // inside window
      });
      const card = makeCard([leech]);
      const items = buildHardestItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(1);
    });

    it("excludes leeches scheduled far beyond grace", () => {
      const leech = makeSection({
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        nextReview: NOW + HARDEST_LEECH_GRACE_MS + DAY,
      });
      const card = makeCard([leech]);
      const items = buildHardestItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(0);
    });

    it("excludes high-difficulty sections beyond their (shorter) grace", () => {
      const hard = makeSection({
        difficulty: 9,
        lapses: 0,
        nextReview: NOW + HARDEST_DIFFICULT_GRACE_MS + DAY,
      });
      const card = makeCard([hard]);
      const items = buildHardestItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items).toHaveLength(0);
    });

    it("places leeches before high-difficulty sections", () => {
      const leech = makeSection({
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        difficulty: 5,
      });
      const hard = makeSection({ difficulty: 9 });
      const card = makeCard([leech, hard]);
      const items = buildHardestItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items[0].section.id).toBe(leech.id);
      expect(items[1].section.id).toBe(hard.id);
    });

    it("caps result at HARDEST_MAX_ITEMS", () => {
      const sections = Array.from({ length: 80 }, () =>
        makeSection({ difficulty: 9 }),
      );
      const card = makeCard(sections);
      const items = buildHardestItems({
        dueCards: [],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      });
      expect(items.length).toBeLessThanOrEqual(HARDEST_MAX_ITEMS);
    });
  });

  describe("buildItemsForMode dispatcher", () => {
    it("routes each mode to the correct builder", () => {
      const card = makeCard([
        makeSection({ state: SectionState.Learning, stability: 1 }),
      ]);
      const args = {
        dueCards: [card],
        allCards: [card],
        srSettings: DEFAULT_SR_SETTINGS,
        now: NOW,
      };
      expect(buildItemsForMode("stabilization", args)).toHaveLength(1);
      expect(buildItemsForMode("critical", args)).toHaveLength(0);
      expect(buildItemsForMode("hardest", args)).toHaveLength(0);
    });
  });

  describe("isEarlyReview", () => {
    it("returns true for non-New section with future nextReview", () => {
      const s = makeSection({ nextReview: NOW + DAY });
      expect(isEarlyReview(s, NOW)).toBe(true);
    });
    it("returns false for due / overdue sections", () => {
      const s = makeSection({ nextReview: NOW - DAY });
      expect(isEarlyReview(s, NOW)).toBe(false);
    });
    it("returns false for New sections", () => {
      const s = makeSection({ state: SectionState.New, nextReview: NOW + DAY });
      expect(isEarlyReview(s, NOW)).toBe(false);
    });
  });
});
