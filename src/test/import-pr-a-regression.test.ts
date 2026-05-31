/**
 * PR-A root-cause regression suite (A2).
 *
 * A1 (PRAGMA foreign_keys per connection) is verified at boot via code in
 * client.ts/dev-fallback.ts; wasm runtime is not loadable in vitest node,
 * so a direct end-to-end assertion is deferred to manual smoke check.
 */
import { describe, it, expect } from "vitest";
import { applyRemapToParsedV2, buildCategoryIdRemap } from "@/lib/backup/import-remap";
import { mergeCardsByStrategy } from "@/lib/backup/write-cards-tx";
import type { Card } from "@/lib/spaced-repetition";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { CategoryRecord } from "@/lib/db-types";

function makeCard(id: string, categoryId: string): Card {
  return { id, categoryId, subcategoryId: null, chapterId: null, type: "essay", createdAt: 0, sections: [], tags: [] } as unknown as Card;
}
function makeCat(id: string, name: string): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}
function emptyParsed(): ParsedBackup {
  return {
    cards: [], categories: [], sources: [], mnemonics: [], mindMaps: [],
    knowledgeBaseArticles: [], majorSystem: [], diary: [], reviewLog: [],
    pomodoroLog: [], calibrationLog: [], latencyLog: [], slippageLog: [],
    activityLog: [], disciplineLog: [], mnemonicTestLog: [],
    subcategories: {}, settings: [], srSettings: null, version: 8,
  } as unknown as ParsedBackup;
}

describe("A2: applyRemapToParsedV2 runs pre-merge without mutating currentMap", () => {
  it("rewrites parsed.cards.categoryId so merge sees remapped value", async () => {
    const parsed = emptyParsed();
    parsed.cards = [makeCard("c1", "backup-A")];
    parsed.categories = [makeCat("backup-A", "Civilno")];
    const remap = buildCategoryIdRemap(parsed.categories, [makeCat("live-A", "Civilno")]);
    await applyRemapToParsedV2(remap, parsed);
    expect(parsed.cards[0].categoryId).toBe("live-A");
    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, {}, "overwrite");
    expect(merged[0].categoryId).toBe("live-A");
    expect(nextMap["c1"].categoryId).toBe("live-A");
  });

  it("does NOT mutate caller-owned currentMap on non-overwrite import", async () => {
    const liveCard = makeCard("live-1", "live-A");
    const currentMap: Record<string, Card> = { "live-1": liveCard };
    const ref = currentMap;
    const parsed = emptyParsed();
    parsed.cards = [makeCard("backup-1", "backup-A")];
    parsed.categories = [makeCat("backup-A", "Civilno")];
    const remap = buildCategoryIdRemap(parsed.categories, [makeCat("live-A", "Civilno")]);
    await applyRemapToParsedV2(remap, parsed);
    expect(currentMap).toBe(ref);
    expect(currentMap["live-1"].categoryId).toBe("live-A");
    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, "keep");
    expect(merged[0].id).toBe("backup-1");
    expect(merged[0].categoryId).toBe("live-A");
    expect(nextMap["live-1"].categoryId).toBe("live-A");
  });

  it("is a no-op when remap is empty", async () => {
    const parsed = emptyParsed();
    parsed.cards = [makeCard("c1", "x")];
    parsed.sources = [{ id: "s1", categoryId: "x" }] as unknown as ParsedBackup["sources"];
    await applyRemapToParsedV2(new Map(), parsed);
    expect(parsed.cards[0].categoryId).toBe("x");
    expect(parsed.sources[0].categoryId).toBe("x");
  });
});
