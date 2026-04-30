## Goal

Add a Vitest suite that verifies `bulkCreateArticlesIfMissing` is **atomic** and **duplicate-free under concurrent calls**, exercising the real Dexie `rw` transaction semantics (not a mock).

## Files

- **add dev-dep**: `fake-indexeddb` (already installed in this turn — provides an in-memory IndexedDB so Dexie works under jsdom).
- **created**: `src/test/zettelkasten-bulk-create.test.ts`

No production code changes. No changes to `vitest.config.ts` or `src/test/setup.ts` — the test imports `"fake-indexeddb/auto"` locally so other tests are unaffected.

## Test Coverage

Single-call correctness:
1. **Case-insensitive skip** — pre-existing "Ustav" + input `["ustav", "USTAV ", "Zakon", "  zakon  ", ""]` creates exactly one new row ("Zakon").
2. **All-existing input** — returns `[]`, writes nothing.
3. **Subject scoping** — same title in `SUBJECT_B` doesn't block creation in `SUBJECT_A`.

Concurrency (the core contract):
4. **Overlapping pair** — two `Promise.all` calls sharing one title each contribute exactly one "Shared" row + their unique titles. Total `created.length` across both results = 3, and only one of the two return arrays claims "Shared".
5. **Hot race on a single title** — 10 parallel calls all asking for `"Race"` produce exactly one row; sum of returned `created.length` = 1.
6. **Disjoint parallel batches** — three non-overlapping concurrent calls all fully succeed (5 rows).

## Technical Notes

- Each test starts with `await db.knowledgeBaseArticles.clear()` in `beforeEach` for isolation.
- `fake-indexeddb/auto` installs globals before Dexie opens the DB; importing it at the top of the test file is sufficient.
- The concurrency tests rely on Dexie's `rw` transaction queue serialising overlapping writes on the same table — the same mechanism production uses. If the implementation regressed to per-title round-trips outside a transaction, test #5 would create N rows and fail.
- No fake timers; the operations are awaited directly.

## Verification

Run via `bunx vitest run src/test/zettelkasten-bulk-create.test.ts`. All six cases must pass against the current implementation in `src/lib/zettelkasten-storage.ts`.
