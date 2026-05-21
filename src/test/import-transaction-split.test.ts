import { describe, it, expect } from "vitest";
import {
  mergeCardsByStrategy,
} from "@/lib/backup/write-cards-tx";
import {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsed,
  pruneOrphans,
} from "@/lib/backup/import-remap";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

// ─────────────────────────────────────────────────────────────────────────
// Minimal factories — we only care about the fields the helpers read.
// ─────────────────────────────────────────────────────────────────────────

function makeCard(
  id: string,
  categoryId = "cat-1",
  lastReviewed = 0,
): Card {
  return {
    id,
    categoryId,
    subcategoryId: "",
    chapterId: "",
    tags: [],
    sections: [
      {
        id: `${id}-s1`,
        title: "",
        content: "",
        sourceContent: "",
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        lastReviewed,
        nextReview: 0,
        status: "New",
      },
    ],
  } as unknown as Card;
}

function makeCat(id: string, name: string): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

function emptyParsed(): ParsedBackup {
  return {
    version: 7,
    type: "full",
    cards: [],
    categories: [],
    sources: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
    mnemonics: [],
    reviewLog: [],
    diary: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    pomodoroLog: [],
    majorSystem: [],
    mnemonicTestLog: [],
    settings: [],
  } as unknown as ParsedBackup;
}

// ─────────────────────────────────────────────────────────────────────────
// mergeCardsByStrategy
// ─────────────────────────────────────────────────────────────────────────

describe("mergeCardsByStrategy", () => {
  it("`keep` adds only new IDs, leaves existing untouched", () => {
    const existing = { a: makeCard("a") };
    const imported = [makeCard("a", "cat-9"), makeCard("b", "cat-9")];
    const { merged, nextMap } = mergeCardsByStrategy(imported, existing, "keep");
    expect(merged.map((c) => c.id)).toEqual(["b"]);
    expect(nextMap.a.categoryId).toBe("cat-1"); // not overwritten
    expect(nextMap.b.categoryId).toBe("cat-9");
  });

  it("`overwrite` clears existing map and replaces with imported", () => {
    const existing = { a: makeCard("a"), c: makeCard("c") };
    const imported = [makeCard("b"), makeCard("a", "cat-9")];
    const { merged, nextMap } = mergeCardsByStrategy(imported, existing, "overwrite");
    expect(Object.keys(nextMap).sort()).toEqual(["a", "b"]);
    expect(nextMap.a.categoryId).toBe("cat-9");
    expect(nextMap.c).toBeUndefined();
    expect(merged).toHaveLength(2);
  });

  it("`newer` uses max(section.lastReviewed) to decide replacements", () => {
    const existing = { a: makeCard("a", "cat-1", 100), b: makeCard("b", "cat-1", 500) };
    const imported = [makeCard("a", "cat-9", 200), makeCard("b", "cat-9", 50)];
    const { merged, nextMap } = mergeCardsByStrategy(imported, existing, "newer");
    expect(nextMap.a.categoryId).toBe("cat-9"); // 200 > 100 → replaced
    expect(nextMap.b.categoryId).toBe("cat-1"); // 50 < 500 → kept
    expect(merged.map((c) => c.id)).toEqual(["a"]);
  });

  it("does not mutate the input currentMap reference", () => {
    const existing = { a: makeCard("a") };
    const before = existing.a;
    mergeCardsByStrategy([makeCard("b")], existing, "keep");
    expect(existing.a).toBe(before);
    expect(Object.keys(existing)).toEqual(["a"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// isCategoryRecordArray + buildCategoryIdRemap
// ─────────────────────────────────────────────────────────────────────────

describe("isCategoryRecordArray", () => {
  it("returns false for empty array", () => {
    expect(isCategoryRecordArray([])).toBe(false);
  });
  it("returns false for legacy string[] format", () => {
    expect(isCategoryRecordArray(["Krivično pravo"] as unknown as CategoryRecord[])).toBe(false);
  });
  it("returns true for modern CategoryRecord[]", () => {
    expect(isCategoryRecordArray([makeCat("id-1", "X")])).toBe(true);
  });
});

describe("buildCategoryIdRemap", () => {
  it("remaps backup-IDs to existing-IDs by case-insensitive name match", () => {
    const parsed = [makeCat("backup-1", "KRIVIČNO PRAVO"), makeCat("backup-2", "Civilno")];
    const existing = [makeCat("live-1", "krivično pravo"), makeCat("live-99", "Ustavno")];
    const remap = buildCategoryIdRemap(parsed, existing);
    expect(remap.get("backup-1")).toBe("live-1");
    expect(remap.has("backup-2")).toBe(false);
  });

  it("does not remap when backup id already matches existing id", () => {
    const id = "same-id";
    const remap = buildCategoryIdRemap(
      [makeCat(id, "Foo")],
      [makeCat(id, "Foo")],
    );
    expect(remap.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// applyRemapToParsed
// ─────────────────────────────────────────────────────────────────────────

describe("applyRemapToParsed", () => {
  it("rewrites categoryId on cards, sources, mnemonics, mindMaps, KB articles", async () => {
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "old-cat" }] as unknown as ParsedBackup["sources"];
    parsed.mnemonics = [{ id: "m1", categoryId: "old-cat" }] as unknown as ParsedBackup["mnemonics"];
    parsed.mindMaps = [{ id: "mm1", categoryId: "old-cat" }] as unknown as ParsedBackup["mindMaps"];
    parsed.knowledgeBaseArticles = [
      { id: "kb1", subjectId: "old-cat" },
    ] as unknown as ParsedBackup["knowledgeBaseArticles"];

    const card = makeCard("c1", "old-cat");
    const map: Record<string, Card> = { c1: card };
    const remap = new Map([["old-cat", "new-cat"]]);

    await applyRemapToParsed(remap, parsed, [card], map);

    expect(card.categoryId).toBe("new-cat");
    expect(map.c1.categoryId).toBe("new-cat");
    expect(parsed.sources[0].categoryId).toBe("new-cat");
    expect(parsed.mnemonics[0].categoryId).toBe("new-cat");
    expect(parsed.mindMaps[0].categoryId).toBe("new-cat");
    expect((parsed.knowledgeBaseArticles[0] as unknown as { subjectId: string }).subjectId)
      .toBe("new-cat");
  });

  it("no-ops when remap is empty", async () => {
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "x" }] as unknown as ParsedBackup["sources"];
    await applyRemapToParsed(new Map(), parsed, [], {});
    expect(parsed.sources[0].categoryId).toBe("x");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// pruneOrphans
// ─────────────────────────────────────────────────────────────────────────

describe("pruneOrphans", () => {
  it("drops satellite rows whose category is no longer valid", () => {
    const parsed = emptyParsed();
    parsed.sources = [
      { id: "keep", categoryId: "live-1" },
      { id: "drop", categoryId: "ghost" },
    ] as unknown as ParsedBackup["sources"];
    parsed.mindMaps = [
      { id: "keep", categoryId: "live-1" },
      { id: "drop", categoryId: "ghost" },
    ] as unknown as ParsedBackup["mindMaps"];
    parsed.mnemonics = [
      { id: "keep", categoryId: "live-1" },
      { id: "drop", categoryId: "ghost" },
    ] as unknown as ParsedBackup["mnemonics"];
    parsed.knowledgeBaseArticles = [
      { id: "keep", subjectId: "live-1" },
      { id: "drop", subjectId: "ghost" },
    ] as unknown as ParsedBackup["knowledgeBaseArticles"];

    pruneOrphans(parsed, new Set(["live-1"]));

    expect(parsed.sources.map((s) => s.id)).toEqual(["keep"]);
    expect(parsed.mindMaps.map((m) => m.id)).toEqual(["keep"]);
    expect(parsed.mnemonics.map((m) => m.id)).toEqual(["keep"]);
    expect(parsed.knowledgeBaseArticles.map((a) => a.id)).toEqual(["keep"]);
  });

  it("keeps rows without a categoryId at all (e.g. global mindMaps)", () => {
    const parsed = emptyParsed();
    parsed.mindMaps = [
      { id: "global" },
    ] as unknown as ParsedBackup["mindMaps"];
    pruneOrphans(parsed, new Set(["live-1"]));
    expect(parsed.mindMaps.map((m) => m.id)).toEqual(["global"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Re-export contract
// ─────────────────────────────────────────────────────────────────────────

describe("import-transaction re-exports", () => {
  it("still exports orchestrator + helpers from the legacy path", async () => {
    const mod = await import("@/lib/backup/import-transaction");
    expect(typeof mod.applyImportAtomically).toBe("function");
    expect(typeof mod.mergeCardsByStrategy).toBe("function");
    expect(typeof mod.writeCardsTx).toBe("function");
    expect(typeof mod.writeCategoriesTx).toBe("function");
    expect(typeof mod.writeSatelliteTablesTx).toBe("function");
    expect(typeof mod.buildCategoryIdRemap).toBe("function");
    expect(typeof mod.pruneOrphans).toBe("function");
  });
});
