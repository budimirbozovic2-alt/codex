import { describe, it, expect } from "vitest";
import {
  computeSubjectReadiness,
  computeCoveragePct,
  computeRetentionPct,
  readinessLevelFromScore,
} from "@/lib/subject/readiness-score";
import { createCard, SectionState } from "@/lib/spaced-repetition";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { htmlToDoc } from "@/lib/editor-v4";

const DOC = htmlToDoc("<p>test</p>");

function makeLearnedCard(question: string, scoreHint: "high" | "low" = "high") {
  const card = createCard(question, [{ title: "Odgovor", contentDoc: DOC }], "cat-1");
  const sec = card.sections[0]!;
  sec.state = SectionState.Review;
  sec.stability = scoreHint === "high" ? 30 : 1;
  sec.difficulty = scoreHint === "high" ? 3 : 8;
  sec.lastReviewed = Date.now() - 86400000;
  sec.nextReview = Date.now() + 86400000 * 7;
  return card;
}

describe("readiness-score", () => {
  it("returns 0 score for empty card set", () => {
    const r = computeSubjectReadiness([], { srSettings: DEFAULT_SR_SETTINGS });
    expect(r.score).toBe(0);
    expect(r.level).toBe("kritična");
  });

  it("computes high readiness for fully learned strong cards", () => {
    const cards = [
      makeLearnedCard("Q1", "high"),
      makeLearnedCard("Q2", "high"),
    ];
    const r = computeSubjectReadiness(cards, { srSettings: DEFAULT_SR_SETTINGS });
    expect(r.coveragePct).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.level).toMatch(/visoka|solidna/);
  });

  it("lowers health when endangered and errors present", () => {
    const good = makeLearnedCard("Good", "high");
    const bad = makeLearnedCard("Bad", "low");
    bad.type = "essay";
    bad.isEndangered = true;
    bad.errorLog = [{
      text: "propustio rok",
      count: 3,
      recentSuccesses: 0,
      successStreak: 0,
      lastMissed: new Date().toISOString(),
    }];

    const r = computeSubjectReadiness([good, bad], { srSettings: DEFAULT_SR_SETTINGS });
    expect(r.healthPct).toBeLessThan(100);
    expect(r.risks.some((x) => x.code === "endangered")).toBe(true);
    expect(r.risks.some((x) => x.code === "errors")).toBe(true);
    expect(r.score).toBeLessThan(
      computeSubjectReadiness([good, makeLearnedCard("G2", "high")], { srSettings: DEFAULT_SR_SETTINGS }).score,
    );
  });

  it("applies planner red penalty", () => {
    const cards = [makeLearnedCard("Q", "high")];
    const base = computeSubjectReadiness(cards, { srSettings: DEFAULT_SR_SETTINGS });
    const late = computeSubjectReadiness(cards, {
      srSettings: DEFAULT_SR_SETTINGS,
      plannerStatus: "red",
      plannerDaysLate: 21,
    });
    expect(late.score).toBeLessThan(base.score);
    expect(late.plannerAdjustment).toBeGreaterThan(0);
    expect(late.risks.some((x) => x.code === "planner-red")).toBe(true);
  });

  it("computeCoveragePct ignores New sections", () => {
    const card = createCard("A", [{ title: "N", contentDoc: DOC }], "c");
    const learned = makeLearnedCard("B", "high");
    expect(computeCoveragePct([card, learned])).toBe(50);
  });

  it("computeRetentionPct skips New sections", () => {
    const cards = [createCard("A", [{ title: "N", contentDoc: DOC }], "c")];
    expect(computeRetentionPct(cards)).toBe(0);
  });

  it("readinessLevelFromScore buckets", () => {
    expect(readinessLevelFromScore(85)).toBe("visoka");
    expect(readinessLevelFromScore(70)).toBe("solidna");
    expect(readinessLevelFromScore(55)).toBe("umjerena");
    expect(readinessLevelFromScore(40)).toBe("niska");
    expect(readinessLevelFromScore(20)).toBe("kritična");
  });
});
