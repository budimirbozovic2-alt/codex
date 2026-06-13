import { describe, it, expect } from "vitest";
import { calcResistance, type ResistanceWeights } from "./resistance";
import { SectionState } from "@/lib/spaced-repetition";
import type { Card } from "@/lib/spaced-repetition";
import type { LatencyEntry } from "@/domains/metacognition/metacognitive-storage";

const DEFAULT: ResistanceWeights = { lapses: 40, latency: 30, forgetting: 30 };
const LAPSE_HEAVY: ResistanceWeights = { lapses: 80, latency: 10, forgetting: 10 };

function makeCard(categoryId: string, stability = 2): Card {
  return {
    id: crypto.randomUUID(),
    question: "Q?",
    categoryId,
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
    sections: [{
      id: crypto.randomUUID(),
      title: "S",
      contentDoc: { version: 4, content: { type: "doc", content: [] } },
      state: SectionState.Review,
      stability,
      difficulty: 6,
      interval: 2,
      nextReview: Date.now(),
      lastReviewed: Date.now() - 86400000,
      lapses: 0,
      elapsedDays: 1,
      scheduledDays: 2,
      firstReviewPending: false,
    }],
  };
}

describe("calcResistance", () => {
  it("skips categories with no cards", () => {
    const rows = calcResistance([], ["empty-cat"], [], [], {}, DEFAULT);
    expect(rows).toHaveLength(0);
  });

  it("counts grade <= 2 as lapses", () => {
    const cat = "cat-a";
    const card = makeCard(cat);
    const secId = card.sections[0].id;
    const reviewLog = [
      { timestamp: Date.now(), cardId: card.id, sectionId: secId, grade: 1, category: cat },
      { timestamp: Date.now(), cardId: card.id, sectionId: secId, grade: 3, category: cat },
      { timestamp: Date.now(), cardId: card.id, sectionId: secId, grade: 2, category: cat },
    ];

    const rows = calcResistance([card], [cat], reviewLog, [], {}, DEFAULT);
    expect(rows[0].lapseCount).toBe(2);
  });

  it("incorporates latency into cognitive load", () => {
    const cat = "cat-a";
    const card = makeCard(cat, 10);
    const latency: LatencyEntry[] = [
      { timestamp: Date.now(), cardId: card.id, sectionId: card.sections[0].id, latencyMs: 8000, category: cat },
      { timestamp: Date.now(), cardId: card.id, sectionId: card.sections[0].id, latencyMs: 8000, category: cat },
    ];

    const noLatency = calcResistance([card], [cat], [], [], {}, DEFAULT)[0].cognitiveLoad;
    const withLatency = calcResistance([card], [cat], [], latency, {}, DEFAULT)[0].cognitiveLoad;

    expect(withLatency).toBeGreaterThan(noLatency);
    expect(calcResistance([card], [cat], [], latency, {}, DEFAULT)[0].avgLatency).toBe(8);
  });

  it("uses fallback weights when category is missing from map", () => {
    const cat = "cat-a";
    const card = makeCard(cat);
    const reviewLog = [
      { timestamp: Date.now(), cardId: card.id, sectionId: card.sections[0].id, grade: 1, category: cat },
    ];

    const explicit = calcResistance([card], [cat], reviewLog, [], { [cat]: DEFAULT }, DEFAULT);
    const fallback = calcResistance([card], [cat], reviewLog, [], {}, DEFAULT);

    expect(fallback[0].cognitiveLoad).toBe(explicit[0].cognitiveLoad);
  });

  it("uses subject-specific weights when provided per category", () => {
    const catA = "cat-a";
    const catB = "cat-b";
    const cards = [makeCard(catA), makeCard(catB)];
    const reviewLog = [
      { timestamp: Date.now(), cardId: cards[0].id, sectionId: cards[0].sections[0].id, grade: 1, category: catA },
      { timestamp: Date.now(), cardId: cards[1].id, sectionId: cards[1].sections[0].id, grade: 1, category: catB },
    ];

    const globalRows = calcResistance(cards, [catA, catB], reviewLog, [], {}, DEFAULT);
    const subjectRows = calcResistance(
      cards,
      [catA, catB],
      reviewLog,
      [],
      { [catA]: LAPSE_HEAVY },
      DEFAULT,
    );

    const globalA = globalRows.find((r) => r.categoryId === catA)!.cognitiveLoad;
    const subjectA = subjectRows.find((r) => r.categoryId === catA)!.cognitiveLoad;
    const globalB = globalRows.find((r) => r.categoryId === catB)!.cognitiveLoad;
    const subjectB = subjectRows.find((r) => r.categoryId === catB)!.cognitiveLoad;

    expect(subjectA).toBeGreaterThan(globalA);
    expect(subjectB).toBe(globalB);
  });

  it("sorts rows by cognitive load descending", () => {
    const low = "cat-low";
    const high = "cat-high";
    const cards = [makeCard(low, 25), makeCard(high, 0.5)];
    const reviewLog = [
      { timestamp: Date.now(), cardId: cards[1].id, sectionId: cards[1].sections[0].id, grade: 1, category: high },
      { timestamp: Date.now(), cardId: cards[1].id, sectionId: cards[1].sections[0].id, grade: 1, category: high },
    ];

    const rows = calcResistance(cards, [low, high], reviewLog, [], {}, DEFAULT);
    expect(rows[0].categoryId).toBe(high);
    expect(rows[0].cognitiveLoad).toBeGreaterThanOrEqual(rows[1].cognitiveLoad);
  });

  it("clamps cognitive load to 100", () => {
    const cat = "cat-a";
    const card = makeCard(cat, 0.1);
    const reviewLog = Array.from({ length: 10 }, () => ({
      timestamp: Date.now(),
      cardId: card.id,
      sectionId: card.sections[0].id,
      grade: 1,
      category: cat,
    }));
    const latency: LatencyEntry[] = Array.from({ length: 5 }, () => ({
      timestamp: Date.now(),
      cardId: card.id,
      sectionId: card.sections[0].id,
      latencyMs: 15000,
      category: cat,
    }));

    const rows = calcResistance([card], [cat], reviewLog, latency, {}, DEFAULT);
    expect(rows[0].cognitiveLoad).toBeLessThanOrEqual(100);
  });
});
