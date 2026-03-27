

# Fix H4: Cache `loadSources` to Avoid Redundant IDB Reads

## Problem
Every mount of `RomanForumPage`, `KnowledgeMap`, `SourceManager`, `GlobalSearch`, and `SourcesView` calls `loadSources()` → `db.sources.toArray()`, triggering a full IDB table scan. Sources rarely change (only on import/save/delete), so this is wasteful.

## Solution
Add an in-memory cache in `sources-storage.ts` with invalidation on mutations.

### Changes to `src/lib/sources-storage.ts`
- Add module-level cache: `let _cache: Source[] | null = null`
- `loadSources()` returns `_cache` if set, otherwise loads from IDB and caches
- `saveSource()`, `deleteSource()` invalidate cache (`_cache = null`)
- Export `invalidateSourcesCache()` for external invalidation (e.g., import flows)

### Changes to consumers (5 files)
No changes needed — they already call `loadSources()` which will now return cached data. The `SourcesView` re-fetch after reader close (`loadSources().then(setSources)`) will still work because `saveSource` inside the reader invalidates the cache first.

### Risk
- Very low — pure additive cache with conservative invalidation
- Any mutation path that calls `saveSource`/`deleteSource` auto-invalidates
- Manual invalidation export available for edge cases

