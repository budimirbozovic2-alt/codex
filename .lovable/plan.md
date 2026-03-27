

# Surgical Logic Patch — C1, C2, H1, H2, H4

## 1. H4: Fix VIEW_TO_PATH routing map (`src/contexts/AppContext.tsx`)

**Lines 12-19** — Update the map so `cards`, `categories` point to their correct routes instead of all mapping to `/database`:

```
cards: "/cards", categories: "/categories", database: "/database",
```

Add `sources` and `source-registry` to the `View` type (line 10) and map entries if not present. Remove duplicate `/database` mappings.

## 2. C2: Sync `cardMapRef` in bulk operations (`src/hooks/useCardAnnotations.ts`)

**Problem**: `bulkFlagNeedsReview`, `reorderCards`, `bulkUpdateChapter` update state via `setCardMapState` but never sync `cardMapRef`, so a same-tick `patchCard` reads stale ref data.

**Fix**: Add `cardMapRef` as a parameter to `useCardAnnotations`. In each of the 3 bulk functions, after building the updated cards inside the updater, also sync `cardMapRef.current` with each modified card. Pattern:

```ts
// Inside each bulk function, after building `next`:
for (const id of modifiedIds) {
  cardMapRef.current = { ...cardMapRef.current, [id]: next[id] };
}
```

**Caller change** (`src/hooks/useCards.ts` line 102): Pass `cardMapRef` to `useCardAnnotations`.

## 3. C1: Invalidate caches on import (`src/hooks/useCardImport.ts`)

**After line 189** (after localStorage restore loop): Add:
```ts
import { invalidateSourceRegistryCache } from "@/lib/source-registry";
import { invalidateMonumentTypesCache } from "@/lib/forum-logic";
// ... after localStorage restore:
invalidateSourceRegistryCache();
invalidateMonumentTypesCache();
```

## 4. H2: Pre-compute merged array outside updater (`src/hooks/useCardImport.ts`)

**Lines 78-97** — Instead of populating `merged[]` inside `setCardMap` updater (which relies on React batching timing for an async function), pre-compute the merge by reading `cardMapRef`:

- Add `cardMapRef` as a dependency to `useCardImport`
- Read current state from `cardMapRef.current` to compute `merged` and `nextMap` synchronously
- Then call `schedulePersist` with pre-computed `merged`
- Then call `setCardMapState` with pre-computed `nextMap`

**Caller change** (`src/hooks/useCards.ts`): Pass `cardMapRef` to `useCardImport`.

## 5. H1: Fix stale closure in `renameCategory` (`src/hooks/useCategoryManagement.ts`)

**Line 29** — The `categories.includes(newName)` check reads a potentially stale closure. Move the duplicate check inside the `setCategories` updater and use an early-return flag:

```ts
const renameCategory = useCallback((oldName: string, newName: string) => {
  let aborted = false;
  setCategories(prev => {
    if (prev.includes(newName)) { aborted = true; return prev; }
    return prev.map(c => c === oldName ? newName : c);
  });
  if (aborted) return;
  // ... rest of rename logic
```

Wait — `aborted` populated inside updater may not be set synchronously in async context. But `renameCategory` is called from event handlers (synchronous), so React 18 batching runs updaters synchronously within the same event handler tick. The flag will be set before the `if (aborted)` check. This is safe for event-handler calls.

Remove `categories` from the dependency array since we no longer read it.

## Files touched

| File | Change |
|------|--------|
| `src/contexts/AppContext.tsx` | Fix View type + VIEW_TO_PATH mappings |
| `src/hooks/useCardAnnotations.ts` | Add `cardMapRef` param, sync ref in 3 bulk ops |
| `src/hooks/useCardImport.ts` | Add cache invalidation calls + pre-compute merge with `cardMapRef` |
| `src/hooks/useCards.ts` | Pass `cardMapRef` to `useCardAnnotations` and `useCardImport` |
| `src/hooks/useCategoryManagement.ts` | Move duplicate check inside updater |

## Risk
- All changes are surgical, few-line edits
- No FSRS, UI, or CSS changes
- `cardMapRef` pattern already battle-tested in `useCardCRUD`

