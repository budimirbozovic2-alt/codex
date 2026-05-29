/**
 * Slice the v7 backup to "cards + taxonomy only" and assert that every
 * satellite domain is emptied while cards + categories survive untouched.
 *
 * Guards against regressions where someone adds a new satellite table to
 * `ParsedBackup` and forgets to clear it in `sliceParsedBackup`.
 */
import { describe, it, expect } from "vitest";
import { sliceParsedBackup } from "@/lib/backup/import-slice";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

function makeParsed(): ParsedBackup {
  return {
    version: 7,
    type: "full",
    cards: [
      // Cast: schema-shaped fixture; the slice function never inspects card internals.
      { id: "c1", question: "q", sections: [], categoryId: "cat-1", createdAt: 1, readCount: 0, type: "essay", tags: [], errorLog: [], keyParts: [], childCardIds: [] },
    ] as unknown as ParsedBackup["cards"],
    categories: [
      { id: "cat-1", name: "X", sortOrder: 0, subcategories: [] },
    ] as unknown as ParsedBackup["categories"],
    sources: [{ id: "s1" }] as unknown as ParsedBackup["sources"],
    mindMaps: [{ id: "m1" }] as unknown as ParsedBackup["mindMaps"],
    knowledgeBaseArticles: [{ id: "k1" }] as unknown as ParsedBackup["knowledgeBaseArticles"],
    mnemonics: [{ id: "mn1" }] as unknown as ParsedBackup["mnemonics"],
    majorSystem: [{ digit: 0, peg: "x" }] as unknown as ParsedBackup["majorSystem"],
    mnemonicTestLog: [{ cardId: "c1", timestamp: 1 }] as unknown as ParsedBackup["mnemonicTestLog"],
    reviewLog: [{ cardId: "c1", timestamp: 1 }] as unknown as ParsedBackup["reviewLog"],
    diary: [{ id: "d1" }] as unknown as ParsedBackup["diary"],
    calibrationLog: [{ cardId: "c1", timestamp: 1 }] as unknown as ParsedBackup["calibrationLog"],
    latencyLog: [{ cardId: "c1", timestamp: 1 }] as unknown as ParsedBackup["latencyLog"],
    slippageLog: [{ date: "2025-01-01" }] as unknown as ParsedBackup["slippageLog"],
    activityLog: [{ timestamp: 1 }] as unknown as ParsedBackup["activityLog"],
    disciplineLog: [{ date: "2025-01-01" }] as unknown as ParsedBackup["disciplineLog"],
    pomodoroLog: [{ timestamp: 1 }] as unknown as ParsedBackup["pomodoroLog"],
    settings: [{ key: "k", value: "v" }] as unknown as ParsedBackup["settings"],
    srSettings: { dailyGoal: 10 } as unknown as ParsedBackup["srSettings"],
    localStorageData: { "sr-dark-mode": "true" },
    subcategories: undefined,
  } as ParsedBackup;
}

describe("sliceParsedBackup", () => {
  it("full mode returns the input unchanged", () => {
    const p = makeParsed();
    expect(sliceParsedBackup(p, "full")).toBe(p);
  });

  it("cards-and-taxonomy keeps cards + categories, empties every satellite", () => {
    const out = sliceParsedBackup(makeParsed(), "cards-and-taxonomy");

    expect(out.cards).toHaveLength(1);
    expect(out.categories).toHaveLength(1);

    expect(out.sources).toEqual([]);
    expect(out.mindMaps).toEqual([]);
    expect(out.knowledgeBaseArticles).toEqual([]);
    expect(out.mnemonics).toEqual([]);
    expect(out.majorSystem).toEqual([]);
    expect(out.mnemonicTestLog).toEqual([]);
    expect(out.reviewLog).toEqual([]);
    expect(out.diary).toEqual([]);
    expect(out.calibrationLog).toEqual([]);
    expect(out.latencyLog).toEqual([]);
    expect(out.slippageLog).toEqual([]);
    expect(out.activityLog).toEqual([]);
    expect(out.disciplineLog).toEqual([]);
    expect(out.pomodoroLog).toEqual([]);
    expect(out.settings).toEqual([]);
    expect(out.srSettings).toBeUndefined();
    expect(out.localStorageData).toBeUndefined();
  });

  it("does not mutate the input payload", () => {
    const p = makeParsed();
    const before = JSON.stringify(p);
    sliceParsedBackup(p, "cards-and-taxonomy");
    expect(JSON.stringify(p)).toBe(before);
  });
});
