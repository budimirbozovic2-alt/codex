import { describe, it, expect } from "vitest";
import { makeCard } from "@/test/factories";
import { SectionState } from "@/lib/spaced-repetition";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { getSatelliteFsrsStatus } from "@/components/subject-cards/passive-reader/satellite-fsrs-status";
import {
  computeSagaProgress,
  formatSagaProgressLine,
} from "@/components/subject-cards/passive-reader/saga-progress";

describe("passive reader saga progress", () => {
  it("formats mastery and leech summary for pager", () => {
    const essay = makeCard({
      id: "e1",
      type: "essay",
      readCount: 3,
      sections: [{ id: "s1", state: SectionState.Review, stability: 20, difficulty: 4 }],
    });
    const leechFlash = makeCard({
      id: "f1",
      type: "flash",
      parentId: essay.id,
      sections: [{
        id: "fs1",
        state: SectionState.Review,
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        stability: 1,
        difficulty: 8,
        nextReview: Date.now() + 86_400_000,
      }],
    });
    const dueFlash = makeCard({
      id: "f2",
      type: "flash",
      parentId: essay.id,
      sections: [{
        id: "fs2",
        state: SectionState.Review,
        nextReview: Date.now() - 1000,
        stability: 5,
        difficulty: 5,
      }],
    });

    const summary = computeSagaProgress(essay, [leechFlash, dueFlash]);
    const line = formatSagaProgressLine(summary);

    expect(summary.reads).toBe(3);
    expect(summary.leechCount).toBe(1);
    expect(summary.dueCount).toBe(1);
    expect(line).toMatch(/3 pregleda/);
    expect(line).toMatch(/savladano/);
    expect(line).toMatch(/1 blic buba/);
    expect(line).toMatch(/1 dospjelo/);
  });
});

describe("getSatelliteFsrsStatus", () => {
  it("classifies new, due, leech, and ok", () => {
    const past = Date.now() - 1000;
    const future = Date.now() + 86_400_000;

    expect(getSatelliteFsrsStatus(makeCard({
      sections: [{ id: "n", state: SectionState.New }],
    }))).toBe("new");

    expect(getSatelliteFsrsStatus(makeCard({
      sections: [{ id: "d", state: SectionState.Review, nextReview: past, stability: 5 }],
    }))).toBe("due");

    expect(getSatelliteFsrsStatus(makeCard({
      sections: [{
        id: "l",
        state: SectionState.Review,
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        nextReview: future,
        stability: 1,
      }],
    }))).toBe("leech");

    expect(getSatelliteFsrsStatus(makeCard({
      sections: [{ id: "o", state: SectionState.Review, nextReview: future, stability: 10 }],
    }))).toBe("ok");
  });
});
