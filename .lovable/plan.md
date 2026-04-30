# Improve React Performance & Database/Data Flow

Goal: cut per-mutation re-render cost, eliminate O(N) sweeps on every card change, and make IDB writes atomic + cheaper. The structural refactor (5 sibling providers) is done — this plan exploits that split with finer-grained context slicing, derived-state caching, and tighter persistence.

## Findings (verified)

1. **Single fat `CardStateContextValue`** — `cards`, `dueCards`, `stats`, `buckets`, `cardCountByCategory`, `ready`, `dbError` are all in one object. All 17 `useCardData()` consumers re-render on any card mutation, even if they only read `ready` or one map entry.
2. **Monolithic derivation sweep** — `dueCards / stats / categoryStats / cardCountByCategory` are computed in one `useMemo` that walks every card × every section on every `cardMap` change. A single grade re-walks the whole corpus.
3. **O(N) ref clone per mutation** — `useCardCRUD` does `{ ...cardMapRef.current, [id]: updated }` on every put/delete. With 5k cards, that's 5k allocations per click.
4. **Persist queue not transactional** — `idbBulkPutCards(puts)` then `Promise.allSettled(deletes)` are separate IDB calls. A crash between them leaves divergent state. Also no coalescing: 5 puts of the same card flush 5 records.
5. **Buckets rebuild from scratch** — `buildCardBuckets(cards)` runs on every cards array change, even though the bucket of an unchanged card never moves.
6. **`useCardData` HMR fallback hides bugs** — silent empty fallback in DEV (per existing memory) is OK to keep, but the wide context value amplifies its blast radius.

## Plan

### Pass 1 — Slice the card-state context into 4 narrow contexts

Replace single `CardStateContext` with:

| Context | Value | Re-renders when |
|---|---|---|
| `CardListContext` | `{ cards, ready, dbError }` | bootstrap or list shape changes |
| `CardCountsContext` | `{ cardCountByCategory, total }` | per-category counts change |
| `DueQueueContext` | `{ dueCards, dueCount }` | due set changes |
| `StatsContext` | `{ stats, leechCount, totalSections, learnedSections }` | section stats change |
| `BucketsContext` | `buckets` | bucket assignment changes |

`useCardData()` stays as a backwards-compatible shim that pulls all five (deprecated, replaced over time). New focused hooks: `useCardList`, `useCardCounts`, `useDueQueue`, `useCardStats`, `useCardBuckets`. Migrate the 17 callers to the narrowest hook they actually use.

### Pass 2 — Incremental derivation with delta tracking

Split the monolithic `useMemo` into per-slice memos and skip work the inputs don't touch:

- Maintain a `derivedCacheRef` keyed by `cardId → { isDue, scoreSum, sectionCount, isLeech, categoryId }`.
- On `cardMap` change, diff against previous map: only recompute entries for added/changed/deleted ids (O(Δ) instead of O(N)).
- Aggregate slices (`stats`, `categoryStats`, `dueCards`, `counts`) are produced by reducing the cache; sort the due list with the existing sortKeys map but only on the rows that actually changed.

Result: a single grade does ~1 row of work plus a fixed-cost reduction over precomputed scalars per category.

### Pass 3 — Cheap card-map mutations

Stop spread-cloning the full map on every CRUD call. Two options, pick (a):

(a) **Move `cardMap` to a `Map<string, Card>` instead of `Record<string, Card>`.** Mutations become `next = new Map(prev); next.set(id, card)` — V8 optimizes this to a structural-sharing copy and Dexie input doesn't care. Update `mapToArray` to `Array.from(map.values())` cached via the existing `_mapVersion` trick.

If a Map migration is too invasive, (b) keep `Record` but stop cloning `cardMapRef.current` — only clone the React-state map and keep the ref strictly delta-applied: `cardMapRef.current[id] = card`. Mutating the ref in place is safe because we never read it during render.

### Pass 4 — Atomic, coalesced persistence

Rewrite `persistQueue.flush`:

- Coalesce queued actions by `id`: last write wins; a delete after a put cancels the put; a put after a delete cancels the delete.
- Run puts + deletes inside a single `db.transaction("rw", db.cards, …)` so every flush is atomic.
- Replace the 16 ms `setTimeout` with a microtask + idle-callback pair: microtask for ≤8 actions (snappy single edits), idle callback (timeout 50 ms) for larger batches. This removes the perceived input lag on rapid grading without flooding IDB.
- Add a `metrics` counter (DEV only) that logs `{ coalescedFrom, flushedTo, durationMs }` so future regressions are visible.

### Pass 5 — Bucket index instead of full rebuild

Replace `buildCardBuckets(cards)` full sweep with a stateful `BucketIndex`:

- Stored in a ref alongside `cardMapRef`.
- Each CRUD path calls `bucketIndex.upsert(card)` / `bucketIndex.remove(id)` — O(1) per mutation.
- The hook publishes a frozen snapshot via `useSyncExternalStore` so consumers re-render only when bucket membership actually changes.

`buildCardBuckets` stays as the bootstrap one-shot.

### Pass 6 — Tighten DB-queries layer

- Add `idbBulkApply({ puts, deletes })` to `db-queries.ts`, used by the persist queue, that wraps both ops in one transaction.
- Add `idbCountReviewLog`-style helpers for stats already needed by `MyStats`/dashboard so they don't pull all cards through context just to count.
- Keep `idbAddReviewLogEntry` debounce; raise it from 250 ms → 400 ms during Zen/Review (we already know review streaks hit 10/sec) and force-flush on session end via the existing `flushReviewLogQueue`.

### Pass 7 — `useSyncExternalStore` for the heaviest slices

Move `buckets`, `dueCards`, and `cardCountByCategory` off React context into tiny external stores subscribed via `useSyncExternalStore`. Two wins:

- Concurrent-mode safe (no tearing during transitions).
- Selectors can return primitive scalars (`useDueCount()` returns a number) so a component that needs only the badge count never re-renders for any other change.

State derivation logic stays in one place; consumers shrink to the slice they read.

## Out of scope

- ESLint rules (already done).
- Provider topology changes (5-sibling layout stays).
- Any change to FSRS algorithm, Dexie schema, or boot sequence beyond the additions in Pass 6.
- `useCardData` deprecation removal — kept as shim until migration completes.

## Files touched (estimate)

- **Modified** (~10): `src/contexts/cards/CardStateProvider.tsx`, `src/contexts/cards/CardProvider.tsx`, `src/lib/persist-queue.ts`, `src/lib/db-queries.ts`, `src/lib/card-buckets.ts`, `src/hooks/useCardCRUD.ts`, plus 17 consumer files migrated from `useCardData` to focused hooks.
- **New** (~3): `src/contexts/cards/cardStores.ts` (external stores), `src/lib/derived-cache.ts` (delta-tracked aggregates), `src/lib/bucket-index.ts` (incremental bucket store).
- **No deletions**, no schema migrations, no boot changes.

## Risk & validation

- Type system carries Pass 1 — every miscategorized consumer fails type-check.
- Ref-Delta invariants (existing core memory) are preserved: ref still mutated synchronously before async persist; only the cloning shape changes.
- Existing tests cover `card-buckets`, `persist-queue`, `card-ordering`, `spaced-repetition` — they must keep passing. Add a `derived-cache.test.ts` and `bucket-index.test.ts` for the new modules.
- Manual smoke: open Review, grade 50 cards — confirm no input lag and dashboard counters update without full-table re-render (use React DevTools Profiler).
