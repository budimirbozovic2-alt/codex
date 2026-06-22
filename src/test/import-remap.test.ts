import { describe, it, expect } from "vitest";
import { applyRemapToParsed, buildCategoryIdRemap } from "@/lib/backup/import-remap";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";

function makeCard(id: string, categoryId: string): Card {
  return {
    id,
    categoryId,
    subcategoryId: null,
    chapterId: null,
    type: "essay",
    createdAt: 0,
    sections: [],
    tags: [],
  } as unknown as Card;
}

function makeCat(id: string, name: string): CategoryRecord {
  return { id, name, sortOrder: 0, subcategories: [] };
}

function emptyParsed(version = 7): ParsedBackup {
  return {
    cards: [],
    categories: [],
    sources: [],
    mnemonics: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
    majorSystem: [],
    diary: [],
    reviewLog: [],
    pomodoroLog: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    mnemonicTestLog: [],
    subcategories: {},
    settings: [],
    srSettings: null,
    version,
    type: "full",
  } as unknown as ParsedBackup;
}

describe("import-remap schema mismatch", () => {
  it("remaps backup category ids onto live taxonomy by name", async () => {
    const parsed = emptyParsed(6);
    parsed.cards = [makeCard("c-backup", "backup-cat")];
    parsed.categories = [makeCat("backup-cat", "Pravo")];
    const live = [makeCat("live-cat", "Pravo")];
    const remap = buildCategoryIdRemap(parsed.categories, live);
    await applyRemapToParsed(remap, parsed);
    expect(parsed.cards[0].categoryId).toBe("live-cat");
  });
});
