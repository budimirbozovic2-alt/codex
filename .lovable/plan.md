

# Fix: Filters, Edit Navigation & Select All

## Root Cause Analysis

### Bug 1: Learn/Review Filters Broken (Category Mismatch)
**File:** `src/hooks/useCardBootstrap.ts` lines 130 and 133-135

The bootstrap sets:
```ts
const catNames = catRecords.map(r => r.name);  // string[] of NAMES
subsMap[r.name] = r.subcategories;              // keyed by NAME
```

But cards use `card.categoryId` = UUID. In `LearnSession.tsx` line 77:
```ts
let filtered = selectedCategory ? cards.filter(c => c.categoryId === selectedCategory) : [...cards];
```

`selectedCategory` comes from the `categories` array (names), but `card.categoryId` is a UUID. **They never match.** The filter pills show names correctly but filtering produces 0 results.

Similarly `availableCategories` (line 68-71) does `categories.filter(c => cats.has(c))` where `cats` is a Set of UUIDs — so no category pills appear at all.

**The same bug affects ReviewSession** via `SessionFilters`.

### Bug 2: Edit Button Navigates to Non-Existent Route
**File:** `src/views/CategoryView.tsx` line 183

```ts
onEdit={(card) => navigate(`/edit/${card.id}`)}
```

But `App.tsx` line 62 only has `<Route path="/edit" ...>`. No `/edit/:cardId` route exists. EditPage reads `editingCard` from UIContext — which is never set by a URL navigation.

### Bug 3: No "Select All" in CardViewMode
The batch selection toolbar exists but there's no way to select all filtered cards at once.

---

## Fix Plan

### Fix 1: Switch categories/subcategories to UUID-keyed system
**File: `src/hooks/useCardBootstrap.ts`** (2 lines)

- Line 130: `catRecords.map(r => r.name)` → `catRecords.map(r => r.id)` — categories becomes UUID[]
- Line 134: `subsMap[r.name]` → `subsMap[r.id]` — subcategories keyed by UUID

**File: `src/components/SessionFilters.tsx`** (~5 lines)

- Add `categoryRecords?: CategoryRecord[]` prop
- In category pill rendering, resolve UUID → name via categoryRecords lookup: `categoryRecords?.find(r => r.id === c)?.name ?? c`

**File: `src/components/learn/FilterSetup.tsx`** — pass `categoryRecords` through to SessionFilters

**File: `src/components/LearnSession.tsx`** — accept and pass `categoryRecords` prop

**File: `src/components/learn/types.ts`** — add `categoryRecords` to LearnSessionProps

**File: `src/views/LearnPage.tsx`** — pass `categoryRecords` from `useCardContext()`

**File: `src/components/ReviewSession.tsx`** + `src/views/ReviewPage.tsx` — same pattern: pass categoryRecords for display

**Impact on other consumers of `categories` / `subcategories`:**
- `useCardCRUD.ts` uses `categories` for `addCard` default category — must verify it works with UUID
- `CategoryManager.tsx` uses `categories` — audit needed
- `useCards.ts` `setCategories` — persists to IDB via CategoryRecords, needs UUID alignment
- Sidebar, Dashboard — scan for name-based lookups

### Fix 2: Wire Edit Navigation Properly
**File: `src/views/CategoryView.tsx`** line 183

Replace navigate with proper context-based edit:
```ts
import { useUIContext } from "@/contexts/AppContext";
// ...
const { setEditingCard, setView } = useUIContext(); // already available or add
// ...
onEdit={(card) => {
  setEditingCard(card);
  navigate('/edit');
}}
```

Or alternatively, add `useCardActions`'s editing card setter. The key is: set `editingCard` in context BEFORE navigating to `/edit`.

### Fix 3: Add "Select All" Button
**File: `src/components/category/CardViewMode.tsx`**

In the batch selection toolbar area (~line 290-298), when `selectionMode` is active, add a "Označi sve" button:
```tsx
{selectionMode && (
  <Button variant="outline" size="sm" onClick={() => {
    setSelectedIds(new Set(filteredCards.map(c => c.id)));
  }} className="h-7 gap-1.5 text-xs">
    Označi sve ({filteredCards.length})
  </Button>
)}
```

---

## Files Modified
1. `src/hooks/useCardBootstrap.ts` — Switch categories/subcategories to UUID keys
2. `src/components/SessionFilters.tsx` — Add categoryRecords prop, display names from UUID
3. `src/components/learn/FilterSetup.tsx` — Pass categoryRecords
4. `src/components/LearnSession.tsx` — Accept/pass categoryRecords
5. `src/components/learn/types.ts` — Add categoryRecords to props
6. `src/views/LearnPage.tsx` — Pass categoryRecords from context
7. `src/views/CategoryView.tsx` — Fix edit navigation (set editingCard + navigate)
8. `src/components/category/CardViewMode.tsx` — Add "Označi sve" button
9. `src/components/ReviewSession.tsx` — Pass categoryRecords for filter display
10. `src/views/ReviewPage.tsx` — Pass categoryRecords

## Risk Assessment
- **Bootstrap change (categories → UUIDs):** This is the most impactful change. Every consumer of `categories` string[] must be audited. The `setCategories` function in `useCards.ts` uses names to reconcile with CategoryRecords — this must be updated too.
- **Edit fix:** Zero risk, just wiring context correctly.
- **Select All:** Zero risk, purely additive UI.

## Constraints Respected
- No IDB schema changes
- No FSRS math changes
- No Context provider logic changes (only consuming existing data)

