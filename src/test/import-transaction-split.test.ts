import { describe, it, expect } from "vitest";
import {
  mergeCardsByStrategy,
} from "@/lib/backup/write-cards-tx";
import {
  buildCategoryIdRemap,
  applyRemapToParsed,
  pruneOrphans,
} from "@/lib/backup/import-remap";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import { makeCard as makeCardFixture, makeSection } from "./factories";

function makeCard(
  id: string,
  categoryId = "cat-1",
  lastReviewed = 0,
): Card {
  return makeCardFixture({
    id,
    categoryId,
    sections: [makeSection({ html: "<p></p>", lastReviewed })],
  });
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
// buildCategoryIdRemap
// ─────────────────────────────────────────────────────────────────────────

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
  it("rewrites categoryId on parsed.cards, sources, mnemonics, mindMaps, KB articles", async () => {
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "old-cat" }] as unknown as ParsedBackup["sources"];
    parsed.mnemonics = [{ id: "m1", categoryId: "old-cat" }] as unknown as ParsedBackup["mnemonics"];
    parsed.mindMaps = [{ id: "mm1", categoryId: "old-cat" }] as unknown as ParsedBackup["mindMaps"];
    parsed.knowledgeBaseArticles = [
      { id: "kb1", subjectId: "old-cat" },
    ] as unknown as ParsedBackup["knowledgeBaseArticles"];

    const card = makeCard("c1", "old-cat");
    parsed.cards = [card];
    const remap = new Map([["old-cat", "new-cat"]]);

    await applyRemapToParsed(remap, parsed);

    expect(card.categoryId).toBe("new-cat");
    expect(parsed.sources[0].categoryId).toBe("new-cat");
    expect(parsed.mnemonics[0].categoryId).toBe("new-cat");
    expect(parsed.mindMaps[0].categoryId).toBe("new-cat");
    expect((parsed.knowledgeBaseArticles[0] as unknown as { subjectId: string }).subjectId)
      .toBe("new-cat");
  });

  it("no-ops when remap is empty", async () => {
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "x" }] as unknown as ParsedBackup["sources"];
    await applyRemapToParsed(new Map(), parsed);
    expect(parsed.sources[0].categoryId).toBe("x");
  });

  it("does not mutate caller-owned card maps outside parsed.cards", async () => {
    const parsed = emptyParsed();
    const liveCard = makeCard("c1", "old");
    parsed.cards = [makeCard("c-import", "old")];
    const liveMap: Record<string, Card> = { c1: liveCard };

    await applyRemapToParsed(new Map([["old", "new"]]), parsed);

    expect(parsed.cards[0].categoryId).toBe("new");
    expect(liveMap.c1.categoryId).toBe("old");
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

  it("drops mindMaps without a categoryId — categoryId is NOT NULL in the schema", () => {
    const parsed = emptyParsed();
    parsed.mindMaps = [
      { id: "no-category" },
    ] as unknown as ParsedBackup["mindMaps"];
    pruneOrphans(parsed, new Set(["live-1"]));
    expect(parsed.mindMaps.map((m) => m.id)).toEqual([]);
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
    expect(typeof mod.applyRemapToParsed).toBe("function");
    expect(typeof mod.pruneOrphans).toBe("function");
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────
// buildCategoryIdRemap — tricky casing / mixed legacy/modern edges
// ─────────────────────────────────────────────────────────────────────────

describe("buildCategoryIdRemap — edge cases", () => {
  it("preserves Serbian diacritics across casing variants (no NFC normalization)", () => {
    const parsed = [
      makeCat("b-1", "Krivično Pravo"),
      makeCat("b-2", "KRIVIČNO PRAVO"),
    ];
    const existing = [makeCat("live-1", "krivično pravo")];
    const remap = buildCategoryIdRemap(parsed, existing);
    expect(remap.get("b-1")).toBe("live-1");
    expect(remap.get("b-2")).toBe("live-1");
  });

  it("does NOT trim whitespace — trailing space breaks the match", () => {
    const remap = buildCategoryIdRemap(
      [makeCat("b-1", "Civilno ")],
      [makeCat("live-1", "Civilno")],
    );
    expect(remap.size).toBe(0);
  });

  it("with duplicate names in `existing`, the LAST one wins (Map.set semantics)", () => {
    const remap = buildCategoryIdRemap(
      [makeCat("b-1", "Foo")],
      [makeCat("live-a", "Foo"), makeCat("live-b", "Foo")],
    );
    expect(remap.get("b-1")).toBe("live-b");
  });

  it("with duplicate names in `parsed`, both backup IDs remap to the same live ID", () => {
    const remap = buildCategoryIdRemap(
      [makeCat("b-1", "Foo"), makeCat("b-2", "Foo")],
      [makeCat("live-1", "Foo")],
    );
    expect(remap.get("b-1")).toBe("live-1");
    expect(remap.get("b-2")).toBe("live-1");
  });

  it("returns empty map when either side is empty", () => {
    expect(buildCategoryIdRemap([], []).size).toBe(0);
    expect(buildCategoryIdRemap([makeCat("b-1", "X")], []).size).toBe(0);
    expect(buildCategoryIdRemap([], [makeCat("live-1", "X")]).size).toBe(0);
  });

  it("name match wins over identical ID under a different name", () => {
    const remap = buildCategoryIdRemap(
      [makeCat("X", "A")],
      [makeCat("X", "B"), makeCat("Y", "A")],
    );
    expect(remap.get("X")).toBe("Y");
  });

  it("mixed catalog: only name-matching distinct-ID rows enter the remap", () => {
    const parsed = [
      makeCat("b-1", "Match"),
      makeCat("same", "Same"),
      makeCat("b-3", "Orphan"),
    ];
    const existing = [
      makeCat("live-1", "Match"),
      makeCat("same", "Same"),
      makeCat("live-9", "Other"),
    ];
    const remap = buildCategoryIdRemap(parsed, existing);
    expect([...remap.entries()]).toEqual([["b-1", "live-1"]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// applyRemapToParsed — selective / chained / scale / mixed legacy edges
// ─────────────────────────────────────────────────────────────────────────

function makeManyCards(n: number, categoryId: string): Card[] {
  const list: Card[] = [];
  for (let i = 0; i < n; i++) {
    list.push(makeCard(`c${i}`, categoryId));
  }
  return list;
}

describe("applyRemapToParsed — edge cases", () => {
  it("selectively remaps only entries whose categoryId is in the map", async () => {
    const parsed = emptyParsed();
    parsed.sources = [
      { id: "s1", categoryId: "old" },
      { id: "s2", categoryId: "untouched" },
    ] as unknown as ParsedBackup["sources"];
    parsed.mindMaps = [
      { id: "mm1", categoryId: "old" },
      { id: "mm2", categoryId: "untouched" },
    ] as unknown as ParsedBackup["mindMaps"];

    parsed.cards = [makeCard("c1", "old"), makeCard("c2", "untouched")];

    await applyRemapToParsed(new Map([["old", "new"]]), parsed);

    expect(parsed.cards[0].categoryId).toBe("new");
    expect(parsed.cards[1].categoryId).toBe("untouched");
    expect(parsed.sources[0].categoryId).toBe("new");
    expect(parsed.sources[1].categoryId).toBe("untouched");
    expect(parsed.mindMaps[0].categoryId).toBe("new");
    expect(parsed.mindMaps[1].categoryId).toBe("untouched");
  });

  it("single-pass remap on parsed.cards (A→B, B→C does not cascade A→C)", async () => {
    const parsed = emptyParsed();
    parsed.cards = [makeCard("c1", "A")];
    await applyRemapToParsed(
      new Map([["A", "B"], ["B", "C"]]),
      parsed,
    );
    expect(parsed.cards[0].categoryId).toBe("B");
  });

  it("skips mindMaps that have no categoryId (global maps)", async () => {
    const parsed = emptyParsed();
    parsed.mindMaps = [
      { id: "global" },
      { id: "scoped", categoryId: "old" },
    ] as unknown as ParsedBackup["mindMaps"];
    await applyRemapToParsed(new Map([["old", "new"]]), parsed);
    expect((parsed.mindMaps[0] as { categoryId?: string }).categoryId).toBeUndefined();
    expect(parsed.mindMaps[1].categoryId).toBe("new");
  });

  it("KB articles are remapped via `subjectId`, not `categoryId`", async () => {
    const parsed = emptyParsed();
    parsed.knowledgeBaseArticles = [
      { id: "kb1", subjectId: "old", categoryId: "old" },
    ] as unknown as ParsedBackup["knowledgeBaseArticles"];
    await applyRemapToParsed(new Map([["old", "new"]]), parsed);
    const a = parsed.knowledgeBaseArticles[0] as unknown as {
      subjectId: string;
      categoryId: string;
    };
    expect(a.subjectId).toBe("new");
    expect(a.categoryId).toBe("old");
  });

  it("performs a SINGLE-pass remap per loop (A→B, B→C does not cascade A→C on sources)", async () => {
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "A" }] as unknown as ParsedBackup["sources"];
    await applyRemapToParsed(
      new Map([["A", "B"], ["B", "C"]]),
      parsed,
    );
    expect(parsed.sources[0].categoryId).toBe("B");
  });

  it("handles >1000 cards in parsed.cards (crosses the yieldUI boundary)", async () => {
    const parsed = emptyParsed();
    parsed.cards = makeManyCards(1500, "old");
    await applyRemapToParsed(new Map([["old", "new"]]), parsed);
    expect(parsed.cards.every((c) => c.categoryId === "new")).toBe(true);
  });

  it("leaves unmapped category IDs untouched when only some rows match by name", async () => {
    const parsed = emptyParsed();
    parsed.categories = [
      makeCat("live-1", "Match"),
      makeCat("live-2", "Other"),
    ];
    parsed.sources = [
      { id: "s1", categoryId: "legacy-old" },
      { id: "s2", categoryId: "legacy-orphan" },
      { id: "s3", categoryId: "live-2" },
    ] as unknown as ParsedBackup["sources"];
    parsed.mnemonics = [
      { id: "m1", categoryId: "legacy-old" },
      { id: "m2", categoryId: "legacy-orphan" },
    ] as unknown as ParsedBackup["mnemonics"];

    await applyRemapToParsed(
      new Map([["legacy-old", "live-1"]]),
      parsed,
    );

    expect(parsed.sources.map((s) => s.categoryId)).toEqual([
      "live-1",
      "legacy-orphan",
      "live-2",
    ]);
    expect(parsed.mnemonics.map((m) => m.categoryId)).toEqual([
      "live-1",
      "legacy-orphan",
    ]);
  });
});
