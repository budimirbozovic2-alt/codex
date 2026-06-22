import { describe, it, expect } from "vitest";
import { makeCard } from "@/test/factories";
import { computeSubjectTodayStats } from "@/lib/subject/subject-today-queue";
import { SectionState, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";

describe("computeSubjectTodayStats", () => {
  it("counts due, unread, and endangered essays in scope", () => {
    const past = Date.now() - 60_000;
    const future = Date.now() + 60_000;

    const cards = [
      makeCard({
        id: "due-1",
        readCount: 2,
        sections: [{ id: "s1", state: SectionState.Review, nextReview: past }],
      }),
      makeCard({
        id: "unread-1",
        readCount: 0,
        sections: [{ id: "s2", state: SectionState.New, nextReview: future }],
      }),
      makeCard({
        id: "essay-endangered",
        type: "essay",
        isEndangered: true,
        readCount: 1,
        sections: [{ id: "s3", state: SectionState.New, nextReview: future }],
      }),
      makeCard({
        id: "flash-endangered-flag",
        type: "flash",
        isEndangered: true,
        readCount: 0,
        sections: [{ id: "s4", state: SectionState.New, nextReview: future }],
      }),
    ];

    const stats = computeSubjectTodayStats(cards, DEFAULT_SR_SETTINGS);

    expect(stats.dueForConsolidation).toBe(1);
    expect(stats.unread).toBe(2);
    expect(stats.endangeredSagas).toBe(1);
  });
});
