## Audit Status

| # | Fix | Status |
|---|---|---|
| 1 | Virtualize `filteredArticles` in `ZettelkastenView` | ✅ Already done — `ArticleListVirtual` (uses `react-window` `List` for >50 items) is imported on line 32 and rendered on line 612 |
| 2 | Replace `useLiveQuery` for sources in `CategoryView` | ⚠️ Implement now |
| 3 | Single-pass `catNameMap` in `CardList` | ⚠️ Implement now |

Item 1 already matches the request. Items 2 and 3 below.

## Item 2 — `CategoryView` sources fetch

**File**: `src/views/CategoryView.tsx`

**Important deviation from the verbatim request**: the project does NOT have an `EVENT_TYPES.SOURCE_CHANGED` constant, and `EventBus` is built on `BroadcastChannel` for *cross-tab* sync (it does not loopback within the same tab in older browser versions). However, `src/lib/sources-storage.ts` already exposes the correct same-tab notification mechanism: `onSourcesChanged(fn)` — a subscribable callback fired by `saveSource`, `deleteSource`, and `invalidateSourcesCache`. This is the right primitive to use here; it covers both same-tab and (already) cross-tab cases via existing code.

**Changes**:
1. Drop the `useLiveQuery` import and the `db.sources.where(...)` query.
2. Add `useState<Source[]>([])` for `sources`.
3. Add a single `useEffect([categoryId])` that:
   - calls `loadSourcesByCategory(categoryId)` on mount,
   - subscribes to `onSourcesChanged` and re-runs the loader on each change,
   - returns the unsubscribe + cancellation flag for cleanup.
4. Keep the existing `handleSourceUpdated` as-is — it calls `invalidateSourcesCache()` which already triggers `_notify()` → our subscriber re-loads.

**Code shape**:
```tsx
import { loadSourcesByCategory, onSourcesChanged, invalidateSourcesCache } from "@/lib/sources-storage";
import type { Source } from "@/lib/db";

const [sources, setSources] = useState<Source[]>([]);

useEffect(() => {
  if (!categoryId) { setSources([]); return; }
  let cancelled = false;
  const reload = () => {
    loadSourcesByCategory(categoryId).then(s => { if (!cancelled) setSources(s); });
  };
  reload();
  const off = onSourcesChanged(reload);
  return () => { cancelled = true; off(); };
}, [categoryId]);
```

This eliminates the `useLiveQuery` hook (which forces re-renders on *every* IDB write to the `sources` table, even from unrelated categories) while preserving live updates for this category via the targeted listener.

## Item 3 — `CardList` `catNameMap` single-pass

**File**: `src/components/CardList.tsx` lines 108–117

Three loops collapse into one:
```tsx
const catNameMap = useMemo(() => {
  const m: Record<string, string> = {};
  for (const r of allCats) {
    m[r.id] = r.name;
    for (const sub of r.subcategories ?? []) {
      m[sub.id] = sub.name;
      m["__sub_" + sub.id] = sub.name;
      for (const ch of sub.chapters ?? []) {
        m["__ch_" + ch.id] = ch.name;
      }
    }
  }
  return m;
}, [allCats]);
```

Same output map; one pass over `subcategories` and one over `chapters` per category instead of three.

## Verification

- `loadSourcesByCategory` already returns a fresh array (no cache) per call — no stale data.
- `onSourcesChanged` fires after every `saveSource` / `deleteSource` / `invalidateSourcesCache` — matches today's `useLiveQuery` reactivity.
- `catNameMap` is pure transformation; the new loop is provably equivalent to the old three.
- No new dependencies. No test changes.
