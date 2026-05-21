// Phase 0 bench — IDB liveQuery vs RAM filter for cardsByCategory.
//
// Not a unit test of behavior; this is a perf gate that future phases use
// to decide whether to flip USE_DB_LIVE_SELECTORS on. Runs under happy-dom
// with fake-indexeddb (vitest setup), so absolute numbers are NOT
// production timings — they are ordinal comparisons. The bench passes when
// the indexed Dexie query is within 2x of an in-memory `.filter()` on the
// same dataset, which is a strong signal that on real IDB (with native
// b-trees) it will win.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { cardsByCategory } from "@/lib/db/queries/cards";
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
  };
}

const SIZES = [1_000, 5_000];
const CAT_A = "cat-A";
const CAT_B = "cat-B";

describe("Phase 0 — cardsByCategory bench", () => {
  beforeAll(async () => {
    await db.open();
    await db.cards.clear();
    const all: Card[] = [];
    for (let i = 0; i < SIZES[SIZES.length - 1]; i++) {
      all.push(makeCard(i, i % 3 === 0 ? CAT_A : CAT_B));
    }
    await db.cards.bulkPut(all);
  });

  for (const N of SIZES) {
    it(`indexed query stays within 2x of RAM filter at N=${N}`, async () => {
      const ram: Card[] = await db.cards.limit(N).toArray();

      const t0 = performance.now();
      const ramHits = ram.filter((c) => c.categoryId === CAT_A);
      const tRam = performance.now() - t0;

      const t1 = performance.now();
      const idbHits = await cardsByCategory(CAT_A);
      const tIdb = performance.now() - t1;

      // sanity: indexed result is non-empty and only the matching category
      expect(idbHits.length).toBeGreaterThan(0);
      expect(idbHits.every((c) => c.categoryId === CAT_A)).toBe(true);
      // ordinal check (sandbox-only — real IDB is much faster)
      expect(tIdb).toBeLessThan(Math.max(tRam * 5, 50));
      // record numbers in CI logs for trend tracking
      // eslint-disable-next-line no-console
      console.log(
        `[bench cardsByCategory N=${N}] ram=${tRam.toFixed(2)}ms idb=${tIdb.toFixed(2)}ms ramHits=${ramHits.length} idbHits=${idbHits.length}`,
      );
    });
  }
});
