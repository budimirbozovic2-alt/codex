

# Fix: Categories Not Rendering in Sidebar — Definitive Solution

## Root Cause Analysis

From live browser logs, I confirmed:
- `[MemoriaDB] Seeded 9 default categories` ✅
- `cards:data-load-done — 0 cards` ✅  
- `cards:ready` at ~3867ms ✅

The boot completes and calls `setCategoryRecordsState(catRecords)` at line 152 of `useCardBootstrap.ts`. But we have **zero visibility** into whether `catRecords` is actually populated at that point (the `withTimeout` fallback is `[]`), and zero visibility into what the sidebar receives.

## Plan: Debug Logs + Defensive Fallback

### 1. Add debug logging to `useCardBootstrap.ts`

After `seedDefaultCategories()` returns, log the result:
```ts
const catRecords = await withTimeout(seedDefaultCategories(), 2500, "categories load", []);
console.log("[boot:diag] categories loaded:", catRecords.length, catRecords.map(r => r.name));
```

Also log right before setting state:
```ts
console.log("[boot:diag] setting categoryRecords state:", catRecords.length);
setCategoryRecordsState(catRecords);
```

### 2. Add debug logging to `AppSidebar.tsx`

Log what the sidebar actually receives from context:
```ts
const { stats, categoryRecords } = useCardData();
console.log("[sidebar] categoryRecords from context:", categoryRecords.length);
```

### 3. Add defensive fallback in `AppSidebar.tsx`

If after 2 seconds `categoryRecords` is still empty, do a direct DB query as a one-time fallback:
```ts
const [fallbackCategories, setFallbackCategories] = useState<CategoryRecord[]>([]);

useEffect(() => {
  if (categoryRecords.length > 0) return;
  const timer = setTimeout(async () => {
    try {
      const { seedDefaultCategories } = await import("@/lib/db");
      const cats = await seedDefaultCategories();
      console.log("[sidebar] fallback loaded", cats.length, "categories");
      setFallbackCategories(cats);
    } catch (e) { console.error("[sidebar] fallback failed", e); }
  }, 2000);
  return () => clearTimeout(timer);
}, [categoryRecords.length]);

const displayCategories = categoryRecords.length > 0 ? categoryRecords : fallbackCategories;
```

Then map over `displayCategories` instead of `categoryRecords`.

### 4. Add empty-state indicator

If `displayCategories` is still empty, show a visible indicator:
```tsx
{displayCategories.length === 0 && (
  <SidebarMenuItem>
    <span className="px-2 py-1 text-xs text-muted-foreground">Učitavanje...</span>
  </SidebarMenuItem>
)}
```

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useCardBootstrap.ts` | Add 2 debug console.log lines |
| `src/components/AppSidebar.tsx` | Add debug log + defensive DB fallback + loading indicator |

## Why This Works

- Debug logs will definitively show where the chain breaks
- The fallback guarantees categories appear even if context propagation fails
- The loading indicator makes empty state visible instead of silently empty
- No architectural changes — this is a safety net on top of the correct architecture

