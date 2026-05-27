# P2 PR-7f M2 — `backlink-index.ts` decomposition (split-only, 0 behavior change)

## Goal

`src/lib/backlink-index.ts` is a 435-line file mixing five concerns: state shape, pure helpers, the index class, the React hook, and snapshot/paused caches. Split it into a small folder so each file has one job, while keeping every existing import path (`@/lib/backlink-index`) working through a barrel.

This is a pure refactor: zero logic change, zero API change, no consumer touched beyond what the barrel handles transparently.

## Target structure

```text
src/lib/backlink-index/
├── index.ts            # barrel — re-exports public API (replaces old file)
├── types.ts            # BacklinkEntry, SubjectState (internal)
├── normalize.ts        # norm(), snippetFor(), SNIPPET_PAD
├── BacklinkIndex.ts    # the class + singleton `backlinkIndex`
├── snapshot-cache.ts   # memoizedSnapshot, pausedRef, clearPausedBacklinks, EMPTY
└── use-backlinks.ts    # useBacklinks React hook
```

Old path `src/lib/backlink-index.ts` is deleted; folder `index.ts` takes over the module specifier `@/lib/backlink-index` (TS resolves `foo/index.ts` automatically). All 11 importers keep working unchanged.

## File responsibilities

| File | Exports | LOC (approx) |
|------|---------|--------------|
| `types.ts` | `BacklinkEntry` (public), `SubjectState` (internal) | ~30 |
| `normalize.ts` | `norm`, `snippetFor`, `SNIPPET_PAD` (internal) | ~20 |
| `BacklinkIndex.ts` | `class BacklinkIndex`, `backlinkIndex` singleton | ~270 |
| `snapshot-cache.ts` | `memoizedSnapshot`, `pausedRef`, `clearPausedBacklinks`, `EMPTY` | ~50 |
| `use-backlinks.ts` | `useBacklinks` | ~25 |
| `index.ts` (barrel) | re-export: `backlinkIndex`, `useBacklinks`, `clearPausedBacklinks`, `type BacklinkEntry` | ~10 |

## Public API (unchanged)

```ts
export { backlinkIndex } from "./BacklinkIndex";
export { useBacklinks } from "./use-backlinks";
export { clearPausedBacklinks } from "./snapshot-cache";
export type { BacklinkEntry } from "./types";
```

No other symbol was ever exported, so consumers don't notice the move.

## Internal wiring

- `BacklinkIndex.ts` imports `norm`, `snippetFor` from `./normalize`, types from `./types`, and `iterateWikiLinks`/`normalizeKey` from `../zettelkasten-wiki-link`, `KnowledgeBaseArticle` from `../zettelkasten-storage`.
- `snapshot-cache.ts` imports `backlinkIndex` from `./BacklinkIndex`, `norm` from `./normalize`, types from `./types`.
- `use-backlinks.ts` imports `backlinkIndex` from `./BacklinkIndex`, `memoizedSnapshot`/`pausedRef`/`EMPTY` from `./snapshot-cache`, types from `./types`.

No circular imports: `BacklinkIndex` does not import from `snapshot-cache` or `use-backlinks`.

## Test impact

`src/test/backlink-index.test.ts` and the three other tests that import from `@/lib/backlink-index` (`zettelkasten-wiki-link-integration`, `zettelkasten-backlink-counts`, `zettelkasten-aliases`) keep working through the barrel — no edits required.

## Verification

1. `bunx tsc --noEmit` — 0 errors.
2. `bunx vitest run src/test/backlink-index.test.ts src/test/zettelkasten-aliases.test.ts src/test/zettelkasten-backlink-counts.test.ts src/test/zettelkasten-wiki-link-integration.test.ts` — all pass.
3. `rg "from ['\"]@/lib/backlink-index['\"]" src` — 11 hits, unchanged.

## Out of scope (deferred to later M-steps)

- Migrating snapshot caches to `WeakRef`/LRU.
- Replacing `useSyncExternalStore` integration with TanStack Query (next PR-7f milestone).
- Splitting per-subject state into `subject-state.ts` with `createSubjectState()` factory (cosmetic, defer).
- Any change to the wiki-link resolution algorithm.

## Risks

- **Path ambiguity**: TS could in principle resolve both `backlink-index.ts` and `backlink-index/index.ts`. Mitigation: delete the old file in the same patch.
- **Vitest module-graph caching**: a stale `.vite` cache could surface; mitigation: tests run fresh in CI.

## LOC

- Removed: 1 file, 435 lines.
- Added: 6 files, ~405 lines (no logic added, only file scaffolding overhead).
- Net diff: roughly +50/-50 after counting imports/exports, well under the M2 budget.
