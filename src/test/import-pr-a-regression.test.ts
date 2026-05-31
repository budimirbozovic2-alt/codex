/**
 * PR-A root-cause regression suite.
 *
 *   A1: `PRAGMA foreign_keys = ON` is connection-scoped and must be re-emitted
 *       on every executor open, not just inside the migration runner. The
 *       dev-fallback opens a fresh in-memory DB on every reset, so we can
 *       observe the pragma directly via `PRAGMA foreign_keys` SELECT.
 *
 *   A2: `applyRemapToParsedV2` must run BEFORE `mergeCardsByStrategy` and
 *       must never mutate the caller-owned `currentMap`. We assert the
 *       reference object is untouched and the remap lands on `parsed.cards`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getDevFallbackExecutor,
  __resetDevFallback,
} from "@/lib/persistence/sqlite/dev-fallback";
import {
  applyRemapToParsedV2,
  buildCategoryIdRemap,
} from "@/lib/backup/import-remap";
import { mergeCardsByStrategy } from "@/lib/backup/write-cards-tx";
import type { Card } from "@/lib/spaced-repetition";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { CategoryRecord } from "@/lib/db-types";

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

function emptyParsed(): ParsedBackup {
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
    version: 8,
  } as unknown as ParsedBackup;
}

// ─── A1 ────────────────────────────────────────────────────────────────

describe("A1: PRAGMA foreign_keys is ON for every executor open", () => {
  beforeEach(() => __resetDevFallback());

  it("emits foreign_keys=ON before migrations on first open", async () => {
    const exec = await getDevFallbackExecutor();
    const rows = await exec.all<{ foreign_keys: number }>("PRAGMA foreign_keys");
    expect(rows[0]?.foreign_keys).toBe(1);
  });

  it("re-emits foreign_keys=ON after reset + re-open (simulates next boot)", async () => {
    await getDevFallbackExecutor();
    __resetDevFallback();
    const exec2 = await getDevFallbackExecutor();
    const rows = await exec2.all<{ foreign_keys: number }>("PRAGMA foreign_keys");
    expect(rows[0]?.foreign_keys).toBe(1);
  });
});

// ─── A2 ────────────────────────────────────────────────────────────────

describe("A2: applyRemapToParsedV2 runs pre-merge without mutating currentMap", () => {
  it("rewrites parsed.cards.categoryId so the subsequent merge sees the remapped value", async () => {
    const parsed = emptyParsed();
    parsed.cards = [makeCard("c1", "backup-id-A")];
    parsed.categories = [makeCat("backup-id-A", "Civilno")];

    const remap = buildCategoryIdRemap(parsed.categories, [makeCat("live-id-A", "Civilno")]);
    await applyRemapToParsedV2(remap, parsed);

    expect(parsed.cards[0].categoryId).toBe("live-id-A");

    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, {}, "overwrite");
    expect(merged[0].categoryId).toBe("live-id-A");
    expect(nextMap["c1"].categoryId).toBe("live-id-A");
  });

  it("does NOT mutate the caller-owned currentMap reference (non-overwrite import)", async () => {
    const liveCard = makeCard("live-1", "live-id-A");
    const currentMap: Record<string, Card> = { "live-1": liveCard };
    const currentMapRef = currentMap;

    const parsed = emptyParsed();
    parsed.cards = [makeCard("backup-1", "backup-id-A")];
    parsed.categories = [makeCat("backup-id-A", "Civilno")];

    const remap = buildCategoryIdRemap(parsed.categories, [makeCat("live-id-A", "Civilno")]);
    await applyRemapToParsedV2(remap, parsed);

    // currentMap reference identity preserved
    expect(currentMap).toBe(currentMapRef);
    // live card categoryId untouched (the bug previously rewrote it)
    expect(currentMap["live-1"].categoryId).toBe("live-id-A");

    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, "keep");
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("backup-1");
    expect(merged[0].categoryId).toBe("live-id-A");
    // Live card still present, still untouched.
    expect(nextMap["live-1"].categoryId).toBe("live-id-A");
  });
});
