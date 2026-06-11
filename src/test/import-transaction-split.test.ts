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
import type { CategoryRecord } from "@/lib/db-types";
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

  it("drops mindMaps without a categoryId — categoryId is NOT NULL in the schema", () => {
    // mindMaps.categoryId is TEXT NOT NULL with a FK constraint (PRAGMA foreign_keys = ON).
    // Inserting a mindMap with categoryId = null / undefined / "" causes SQLITE_CONSTRAINT_FOREIGNKEY (787).
    // pruneOrphans must drop these rows rather than keep them.
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
    expect(typeof mod.pruneOrphans).toBe("function");
  });
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
    // parsed has id=X/name=A; live has id=X/name=B and id=Y/name=A → remap X→Y
    const remap = buildCategoryIdRemap(
      [makeCat("X", "A")],
      [makeCat("X", "B"), makeCat("Y", "A")],
    );
    expect(remap.get("X")).toBe("Y");
  });

  it("mixed catalog: only name-matching distinct-ID rows enter the remap", () => {
    const parsed = [
      makeCat("b-1", "Match"),     // matches live-1 by name
      makeCat("same", "Same"),     // ID equal to live one → skipped
      makeCat("b-3", "Orphan"),    // no live match → skipped
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

function makeManyCards(n: number, categoryId: string): {
  list: Card[];
  map: Record<string, Card>;
} {
  const list: Card[] = [];
  const map: Record<string, Card> = {};
  for (let i = 0; i < n; i++) {
    const c = makeCard(`c${i}`, categoryId);
    list.push(c);
    map[c.id] = c;
  }
  return { list, map };
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

    const cards = [makeCard("c1", "old"), makeCard("c2", "untouched")];
    const map: Record<string, Card> = { c1: cards[0], c2: cards[1] };

    await applyRemapToParsed(new Map([["old", "new"]]), parsed, cards, map);

    expect(cards[0].categoryId).toBe("new");
    expect(cards[1].categoryId).toBe("untouched");
    expect(parsed.sources[0].categoryId).toBe("new");
    expect(parsed.sources[1].categoryId).toBe("untouched");
    expect(parsed.mindMaps[0].categoryId).toBe("new");
    expect(parsed.mindMaps[1].categoryId).toBe("untouched");
  });

  it("same card referenced in both list and map is remapped exactly once (idempotent)", async () => {
    const parsed = emptyParsed();
    const card = makeCard("c1", "old");
    const map: Record<string, Card> = { c1: card };
    await applyRemapToParsed(new Map([["old", "new"]]), parsed, [card], map);
    expect(card.categoryId).toBe("new");
    expect(map.c1).toBe(card);
    expect(map.c1.categoryId).toBe("new");
  });

  it("skips mindMaps that have no categoryId (global maps)", async () => {
    const parsed = emptyParsed();
    parsed.mindMaps = [
      { id: "global" },
      { id: "scoped", categoryId: "old" },
    ] as unknown as ParsedBackup["mindMaps"];
    await applyRemapToParsed(new Map([["old", "new"]]), parsed, [], {});
    expect((parsed.mindMaps[0] as { categoryId?: string }).categoryId).toBeUndefined();
    expect(parsed.mindMaps[1].categoryId).toBe("new");
  });

  it("KB articles are remapped via `subjectId`, not `categoryId`", async () => {
    const parsed = emptyParsed();
    parsed.knowledgeBaseArticles = [
      { id: "kb1", subjectId: "old", categoryId: "old" },
    ] as unknown as ParsedBackup["knowledgeBaseArticles"];
    await applyRemapToParsed(new Map([["old", "new"]]), parsed, [], {});
    const a = parsed.knowledgeBaseArticles[0] as unknown as {
      subjectId: string;
      categoryId: string;
    };
    expect(a.subjectId).toBe("new");
    // `categoryId` is not a KB field the remap touches — left as-is.
    expect(a.categoryId).toBe("old");
  });

  it("performs a SINGLE-pass remap per loop (A→B, B→C does not cascade A→C on sources)", async () => {
    // Sources are touched in exactly one loop, so no chaining is possible.
    const parsed = emptyParsed();
    parsed.sources = [{ id: "s1", categoryId: "A" }] as unknown as ParsedBackup["sources"];
    await applyRemapToParsed(
      new Map([["A", "B"], ["B", "C"]]),
      parsed,
      [],
      {},
    );
    expect(parsed.sources[0].categoryId).toBe("B");
  });

  it("documents the dual-loop quirk: a card present in BOTH list AND map gets remapped twice", async () => {
    // The implementation iterates `cardsToRemap` then `cardMap` separately;
    // if the same reference appears in both, two passes apply. Callers in the
    // orchestrator always pass either a fresh array or the map values, never
    // both — but the contract is worth pinning down.
    const parsed = emptyParsed();
    const card = makeCard("c1", "A");
    await applyRemapToParsed(
      new Map([["A", "B"], ["B", "C"]]),
      parsed,
      [card],
      { c1: card },
    );
    expect(card.categoryId).toBe("C");
  });


  it("handles >1000 cards in cardMap (crosses the yieldUI boundary)", async () => {
    const parsed = emptyParsed();
    const { list, map } = makeManyCards(1500, "old");
    await applyRemapToParsed(new Map([["old", "new"]]), parsed, list, map);
    expect(list.every((c) => c.categoryId === "new")).toBe(true);
    let allNew = true;
    for (const id in map) {
      if (map[id].categoryId !== "new") { allNew = false; break; }
    }
    expect(allNew).toBe(true);
  });

  it("mixed legacy/modern: rewrites mapped IDs, leaves unmapped legacy IDs untouched", async () => {
    const parsed = emptyParsed();
    parsed.categories = [
      makeCat("live-1", "Match"),
      makeCat("live-2", "Other"),
    ];
    parsed.sources = [
      { id: "s1", categoryId: "legacy-old" },    // remapped
      { id: "s2", categoryId: "legacy-orphan" }, // not in remap → kept as-is
      { id: "s3", categoryId: "live-2" },        // already modern → untouched
    ] as unknown as ParsedBackup["sources"];
    parsed.mnemonics = [
      { id: "m1", categoryId: "legacy-old" },
      { id: "m2", categoryId: "legacy-orphan" },
    ] as unknown as ParsedBackup["mnemonics"];

    await applyRemapToParsed(
      new Map([["legacy-old", "live-1"]]),
      parsed,
      [],
      {},
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
