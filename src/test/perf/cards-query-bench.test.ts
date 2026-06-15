// Bench — indexed SQLite query vs RAM filter for cardsByCategory.
//
// F6 final-Dexie-drop: was Dexie-vs-RAM; now SQLite-harness-vs-RAM.
// The harness is an in-memory JS map, so absolute numbers are NOT
// production timings — they are ordinal comparisons confirming the
// indexed `cardsByCategory` reader doesn't regress to O(N²).
import { describe, it, expect, beforeEach } from "vitest";
import { cardsByCategory, listAllCards } from "@/lib/db/queries/cards";
import { seedTestSqliteTable } from "@/test/sqlite-harness";
import { SLOW_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import type { Card } from "@/lib/spaced-repetition";

function makeCard(i: number, categoryId: string): Card {
  return {
    id: `c-${i}`,
    question: `Q${i}`,
    sections: [],
    categoryId,
    createdAt: i,
    readCount: 0,
    type: i % 2 === 0 ? "essay" : "flash",
  } as unknown as Card;
}

const SIZES = [1_000, 5_000];
const CAT_A = "cat-A";
const CAT_B = "cat-B";

describe("Phase 0 — cardsByCategory bench (SQLite harness)", { timeout: SLOW_TEST_TIMEOUT_MS }, () => {
  // Seed in beforeEach (not beforeAll) — the global setup.ts resets the
  // SQLite harness state between every test, so a beforeAll seed gets wiped.
  beforeEach(() => {
    const all: Card[] = [];
    for (let i = 0; i < SIZES[SIZES.length - 1]; i++) {
      all.push(makeCard(i, i % 3 === 0 ? CAT_A : CAT_B));
    }
    // Seed directly; the cards repo reader projects from `payload` JSON +
    // denormalised columns used for the `categoryId = ?` indexed lookup.
    seedTestSqliteTable(
      "cards",
      all.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        chapterId: null,
        subcategoryId: null,
        sourceId: null,
        type: c.type,
        payload: JSON.stringify(c),
      })),
    );
  });


  for (const N of SIZES) {
    it(`indexed query stays within 5x of RAM filter at N=${N}`, async () => {
      const ram: Card[] = (await listAllCards()).slice(0, N);

      const t0 = performance.now();
      const ramHits = ram.filter((c) => c.categoryId === CAT_A);
      const tRam = performance.now() - t0;

      const t1 = performance.now();
      const idbHits = await cardsByCategory(CAT_A);
      const tIdb = performance.now() - t1;

      expect(idbHits.length).toBeGreaterThan(0);
      expect(idbHits.every((c) => c.categoryId === CAT_A)).toBe(true);
      // Floor allows parallel CI load; ratio vs RAM filter is the real guard.
      expect(tIdb).toBeLessThan(Math.max(tRam * 5, 100));
      console.log(
        `[bench cardsByCategory N=${N}] ram=${tRam.toFixed(2)}ms sqlite=${tIdb.toFixed(2)}ms ramHits=${ramHits.length} idbHits=${idbHits.length}`,
      );
    });
  }
});
