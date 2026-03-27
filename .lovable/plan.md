

# Fix: Persist Expanded Chapters in MentalSkeleton

## Problem
When navigating away from MentalSkeleton and back, all chapters reset to expanded. The user loses track of which chapters they had open/collapsed.

## Solution
Persist `expandedChapters` to `localStorage` using a key scoped to the current category+subcategory. On mount, hydrate from storage instead of blindly expanding all.

## Changes — `src/components/MentalSkeleton.tsx` only

### 1. Storage key & helpers
```ts
const EXPANDED_KEY = `codex-nav-expanded-${category}-${subcategory}`;
```

### 2. Initialize `expandedChapters` from localStorage
Replace the current `useState<Set<string>>(new Set(["__all__"]))` with a lazy initializer that reads from localStorage. If stored value exists and is valid, use it; otherwise default to all chapters expanded.

### 3. Update the `useEffect` (lines 115-118)
Instead of always resetting all chapters to expanded, only set all-expanded when there's **no** stored state (first visit). When stored state exists, merge it with current chapters (remove stale, keep valid).

### 4. Sync to localStorage on change
Add a `useEffect` that writes `expandedChapters` to localStorage whenever it changes:
```ts
useEffect(() => {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedChapters]));
}, [expandedChapters, EXPANDED_KEY]);
```

## Technical details
- Key is scoped per category+subcategory so different subcategories have independent state
- Stale chapter names (renamed/deleted) are filtered out during hydration
- New chapters (added after last visit) default to expanded
- `codex-nav-chapter` key from CardsView remains separate (different purpose)

## Files modified
| File | Change |
|------|--------|
| `src/components/MentalSkeleton.tsx` | Hydrate + persist `expandedChapters` via localStorage |

## Guardrails
- No FSRS/SM-2 changes
- DnD logic untouched
- Existing `codex-nav-category`/`codex-nav-subcategory` keys untouched

