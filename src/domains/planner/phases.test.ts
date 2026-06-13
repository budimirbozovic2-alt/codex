import { describe, it, expect } from "vitest";
import { calcPhaseProgress, getPhaseDisciplinePct } from "./phases";
import { makeCard, makeSection } from "@/test/factories";

describe("calcPhaseProgress", () => {
  const phase = {
    id: "p1",
    name: "Faza 1",
    expectedDays: 14,
    categories: ["cat-a"],
  };

  it("scopes to phase categories", () => {
    const cards = [
      makeCard({
        categoryId: "cat-a",
        sections: [
          makeSection({ lastReviewed: Date.now() }),
          makeSection({ lastReviewed: null }),
        ],
      }),
      makeCard({
        categoryId: "cat-b",
        sections: [makeSection(), makeSection(), makeSection()],
      }),
    ];
    const prog = calcPhaseProgress(phase, cards);
    expect(prog.total).toBe(2);
    expect(prog.learned).toBe(1);
    expect(prog.remainingCards).toBe(1);
    expect(prog.pct).toBe(50);
  });

  it("empty category filter uses all cards", () => {
    const allPhase = { ...phase, categories: [] as string[] };
    const cards = [makeCard({ sections: [makeSection(), makeSection()] })];
    expect(calcPhaseProgress(allPhase, cards).total).toBe(2);
  });
});

describe("getPhaseDisciplinePct", () => {
  it("empty log → 0", () => {
    expect(getPhaseDisciplinePct([])).toBe(0);
  });

  it("all diligent → 100", () => {
    const log = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      status: "diligent" as const,
      planCompletion: 100,
      slippageMs: null,
      reviewsDone: 20,
      suggestedReviews: 20,
    }));
    expect(getPhaseDisciplinePct(log)).toBe(100);
  });

  it("rolling 14-day window only", () => {
    const log = [
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        status: "lazy" as const,
        planCompletion: 30,
        slippageMs: null,
        reviewsDone: 5,
        suggestedReviews: 20,
      })),
      {
        date: "2026-02-01",
        status: "diligent" as const,
        planCompletion: 100,
        slippageMs: null,
        reviewsDone: 20,
        suggestedReviews: 20,
      },
    ];
    expect(getPhaseDisciplinePct(log)).toBeGreaterThan(0);
    expect(getPhaseDisciplinePct(log)).toBeLessThan(100);
  });
});
