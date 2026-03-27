

# Performance Engine — Implementation Plan

## Overview
Six targeted fixes: add `updatedAt` to Card for reliable mastery caching, merge 3×O(n) derived data into 1×O(n), stabilize context references, fix stale closure in addCategory, and harden source cache invalidation on import.

## Batch 1: H1 — Card `updatedAt` + Mastery Cache Fix

### `src/lib/spaced-repetition.ts`
- Add `updatedAt?: number` to the `Card` interface (optional for backward compat)

### `src/hooks/useCardCRUD.ts`
- In `patchCard`: set `updated.updatedAt = Date.now()` before returning from the patcher
- In `addCard` / `addFlashCard`: set `card.updatedAt = Date.now()` at creation

### `src/components/KnowledgeMap.tsx`
- Mastery cache already uses `card.updatedAt` — with the field now populated, it will correctly invalidate

## Batch 2: B2 + B5 — Single-Pass Derived Data

### `src/hooks/useCards.ts`
Replace the three separate `useMemo` blocks (`dueCards`, `stats`, `categoryStats`) and `cardCountByCategory` with one unified `useMemo`:

```text
Single loop over cards → accumulate:
  - dueCards[] (cards with due sections)
  - stats: { due, total, totalSections, learnedSections, leechCount }
  - categoryStats: Record<string, { score, total, due, scoreSum }>
  - cardCountByCategory: Record<string, number>
```

After the loop, finalize category scores (divide scoreSum by total). Sort dueCards by nextReview. This reduces 4×O(n) to 1×O(n).

### `src/lib/spaced-repetition.ts`
Keep existing exported functions unchanged (they're used elsewhere). The merged logic will inline the equivalent calculations.

## Batch 3: B1 — Actions Context Stability

### `src/contexts/AppContext.tsx`
All 27 action functions come from `useCallback` in `useCards`/`useCardCRUD`/etc., so their references are already stable. The real fix: remove all 27 individual deps from the `useMemo` and use a **ref-based pattern**:

```ts
const actionsRef = useRef(actions);
actionsRef.current = { addCard: h.addCard, ... };
const stableActions = useMemo(() => new Proxy({} as CardActionsContextValue, {
  get: (_, prop) => (actionsRef.current as any)[prop]
}), []);
```

This ensures the context value **never changes reference**, eliminating all downstream re-renders from action updates. Consumers call `actions.addCard(...)` which always reads the latest ref.

## Batch 4: B3 — Forum reviewLog Stability

### `src/views/RomanForumPage.tsx`
- Add a `reviewLogVersion` counter: `const logLen = reviewLog.length`
- Use `logLen` as the memo dep instead of `reviewLog` reference:
```ts
const forumState = useMemo(() =>
  calculateForumState(deferredCards, reviewLog, sources),
  [deferredCards, sources, logLen]
);
```
This prevents recalc when the reviewLog array reference changes but its length hasn't (e.g., re-renders from parent).

## Batch 5: B4 — mapToArray Version Cache

### `src/lib/persist-queue.ts`
Replace reference-identity cache with a version counter:
```ts
let _mapVersion = 0;
let _cachedVersion = -1;
let _cachedArray: Card[] = [];

export function bumpMapVersion() { _mapVersion++; }

export function mapToArray(map: CardMap): Card[] {
  if (_mapVersion === _cachedVersion) return _cachedArray;
  _cachedVersion = _mapVersion;
  _cachedArray = Object.values(map);
  return _cachedArray;
}
```

### `src/hooks/useCardCRUD.ts` / `useCardAnnotations.ts` / `useCardImport.ts`
- Call `bumpMapVersion()` after every `setCardMapState` mutation

## Batch 6: H2 + H3 — Closure + Import Cache

### `src/hooks/useCategoryManagement.ts` (H2)
- `addCategory`: use functional updater with dedup check inside:
```ts
setCategories(prev => prev.includes(name) ? prev : [...prev, name]);
```
- Remove `categories` from the dependency array

### `src/hooks/useCardImport.ts` (H3)
- After `db.sources.bulkPut(...)`, call `invalidateSourcesCache()` from `sources-storage.ts`

## Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/spaced-repetition.ts` | Add `updatedAt?: number` to Card |
| `src/hooks/useCardCRUD.ts` | Set `updatedAt` on patch/add; call `bumpMapVersion()` |
| `src/hooks/useCards.ts` | Merge 4 useMemo into single-pass |
| `src/contexts/AppContext.tsx` | Ref-based stable actions context |
| `src/views/RomanForumPage.tsx` | Use `reviewLog.length` as memo dep |
| `src/lib/persist-queue.ts` | Version-based mapToArray cache |
| `src/hooks/useCardAnnotations.ts` | Call `bumpMapVersion()` |
| `src/hooks/useCardImport.ts` | Call `bumpMapVersion()` + `invalidateSourcesCache()` |
| `src/hooks/useCategoryManagement.ts` | Fix addCategory stale closure |

## Risk Assessment
- **Single-pass merge**: Medium — must replicate exact `getCardScore`/`isLeech` logic inline. Will keep original functions for other consumers.
- **Proxy-based actions**: Low — transparent to consumers, same API.
- **Version counter**: Low — additive, no existing logic changed.
- **FSRS logic**: Untouched.

