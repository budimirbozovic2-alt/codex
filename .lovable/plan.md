

# Targeted Fixes — Only What's Actually Missing

## Findings

| File | Claim | Verdict |
|------|-------|---------|
| `useCardBootstrap.ts` | `bumpMapVersion()` deleted | **TRUE** — must add |
| `CategoryView.tsx` | Infinite loading fix deleted | **TRUE** — `undefined` ambiguity exists |
| `CategoryView.tsx` | Edit navigation deleted | **FALSE** — already fixed (line 184) |
| `LearnPage.tsx` | Ready guard deleted | **FALSE** — exists (lines 45-52) |
| `ReviewPage.tsx` | Ready guard deleted | **FALSE** — exists (lines 46-53) |

## Plan: Apply only the 2 real fixes

### Fix 1: `src/hooks/useCardBootstrap.ts`
- Add `bumpMapVersion` to the import from `@/lib/persist-queue` (line 4)
- Add `bumpMapVersion();` call after `setCardMapState(arrayToMap(c));` (after line 152)

### Fix 2: `src/views/CategoryView.tsx`
- Change `useLiveQuery` for category (lines 28-31) to return `null` explicitly when record not found:
```ts
const category = useLiveQuery(
  async () => {
    if (!categoryId) return null;
    const cat = await db.categories.get(categoryId);
    return cat || null;
  },
  [categoryId]
);
```
- Update the loading check (line 110) to `category === undefined` (stays same — means "still loading")
- The `!category` check (line 118) now correctly catches `null` (not found)

### NOT applying LearnPage/ReviewPage changes
The user's proposed code adds `cards, reviewLog, session` to useEffect dependency arrays. The current code intentionally uses `eslint-disable-next-line` to run `startSession` only once when `ready` flips. Adding unstable references to deps would cause repeated session restarts on every card mutation. The existing code is correct.

## Scope
- 2 files, ~5 lines changed
- No schema, FSRS, or context changes

