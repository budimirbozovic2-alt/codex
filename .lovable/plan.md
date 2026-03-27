

# Source Registry — Functional Architecture Summary

## 1. Data Storage & CRUD

**Where Sources live:** Exclusively in **IndexedDB** (`db.sources` table, Dexie). Each Source record contains: `id` (UUID), `label`, `date`, `htmlContent`, `outline`, `articles`, `version`, `createdAt`, `updatedAt`, `officialGazetteInfo`, and optional diff fields (`previousVersionId`, `previousHtmlContent`).

**In-memory cache:** `sources-storage.ts` maintains a simple `_cache: Source[] | null` array. Any mutation (`saveSource`, `deleteSource`) nullifies the cache before writing to IDB, ensuring the next `loadSources()` call fetches fresh data.

**CRUD flow:**
- **Create/Update:** `saveSource(source)` → clears cache → `db.sources.put(source)` → fires `_notify()` to listeners.
- **Read:** `loadSources()` → returns cache if warm, otherwise `db.sources.toArray()`.
- **Delete:** `deleteSource(id)` → inside a Dexie transaction, finds all cards with `sourceId === id`, strips their `sourceId`, `textAnchor`, and `needsReview` fields, bulk-puts the cleaned cards, then deletes the source. Fires `_notify()`.

**Source Registry (alias system):** Stored separately in **localStorage** (`codex-source-registry`) with async IDB backup sync. This is NOT the source documents themselves — it's a mapping layer (`SourceAlias[]`) that groups raw `Source.label` strings under canonical "Master Source" names, plus optional `CategoryOverride[]` for forcing A/B depth mode per category.

---

## 2. The Link to Cards

**Linking mechanism:** Cards reference sources via `card.sourceId` (a UUID pointing to `Source.id`). This is a **proper foreign key by ID**, not a string-name match. Additional fields on the card: `textAnchor` (normalized snippet for scroll-to), `originalSourceSnippet`, `sourceModules`, `childCardIds`.

**On source deletion:** The `deleteSource` function **proactively cleans all linked cards** inside a single Dexie transaction — it sets `sourceId`, `textAnchor`, and `needsReview` to `undefined`. Cards survive, but lose their source link. This is safe.

**On source rename (label change):** Renaming a source means calling `saveSource(updatedSource)` with a new `label`. Since cards link via `sourceId` (UUID), **renaming has zero effect on card linkage**. The card still points to the same source by ID. However, the Source Registry alias map may become stale if it referenced the old `label` string — the user would need to update the alias mapping manually in the Registar izvora UI.

**Edge case — orphaned sourceId:** If a source is deleted outside the normal `deleteSource` flow (e.g., raw IDB manipulation or a corrupted import), cards would retain a `sourceId` pointing to a non-existent source. The UI handles this gracefully: `sourceMap.get(card.sourceId)` returns `undefined`, and functions like `getCardMasterSource` fall back to `"Bez izvora"`.

---

## 3. The Link to the Forum (Monuments)

**How Sources appear in Forum monuments:**
1. `RomanForumPage` loads sources via `loadSources()` and subscribes to `onSourcesChanged()`.
2. It passes `allSources` into `calculateForumState(cards, reviewLog, allSources)`.
3. Inside `calculateForumState`, for each category's cards, it resolves each card's `sourceId` → `Source.label` → Master Source name (via the alias map from Source Registry).
4. This produces a `sources: MonumentSourceBreakdown[]` array on each Monument, showing per-master-source card counts and mastery percentages.

**The `onSourcesChanged` event flow:**
- `sources-storage.ts` maintains a `Set<SourceListener>` of callbacks.
- Every `saveSource()` or `deleteSource()` call fires `_notify()`, which invokes all registered listeners.
- `RomanForumPage` subscribes in a `useEffect`: `onSourcesChanged(() => loadSources().then(setSources))`.
- When sources state updates, React re-renders, `calculateForumState` receives new `allSources`, the fingerprint changes (it includes `sourceCount`), and the Forum rebuilds its monument breakdown.

**Edge case:** The fingerprint check (`buildFingerprint`) includes `allSources.length` but not individual source labels. If you **rename** a source without adding/removing any, the fingerprint won't change and the cached ForumState will be stale until the next card review changes it. This is a minor visual staleness — the monument would show the old Master Source name until the next fingerprint-busting event.

---

## 4. Data Import/Export

**Export:** `useCardExport.ts` calls `db.sources.toArray()` and includes the full `sources` array in the backup JSON alongside cards, categories, reviewLog, mindMaps, diary, settings, and all metacognitive tables. The Source Registry (alias/override config) is exported from localStorage under key `codex-source-registry`.

**Import:** `useCardImport.ts` handles sources:
1. Sanitizes each imported source's `htmlContent` via `sanitizeHtml`.
2. Calls `db.sources.bulkPut(sanitizedSources)`.
3. Calls `invalidateSourcesCache()` to bust the in-memory cache.
4. In "overwrite" strategy: deletes any existing sources whose IDs are not in the import set.

**Edge case — Source Registry sync on import:** The import restores localStorage keys including `codex-source-registry`. After import, `invalidateSourceRegistryCache()` should be called to bust the in-memory registry cache. The import code does call `invalidateSourcesCache()` for sources, but I did not find an explicit `invalidateSourceRegistryCache()` call in the import path — if the imported backup contains a different alias map, the in-memory cache would serve the old one until page reload. This is a **minor gap** that would self-heal on reload but could cause temporary alias mismatch in the same session.

---

## Summary of Edge Cases

| Scenario | Behavior | Risk |
|----------|----------|------|
| Source deleted normally | Cards cleaned (sourceId cleared) in transaction | Safe |
| Source deleted outside app | Cards retain orphan sourceId | Safe — UI falls back to "Bez izvora" |
| Source renamed | Cards unaffected (link by UUID) | Safe — but Source Registry aliases may need manual update |
| Source renamed + Forum | Fingerprint may not bust → stale monument labels until next card review | Minor visual staleness |
| Import with different Source Registry | In-memory alias cache may not invalidate | Self-heals on reload |

