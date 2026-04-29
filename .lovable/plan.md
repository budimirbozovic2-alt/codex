## Goal

Five focused enhancements across SRS scheduling, review transparency, Zettelkasten knowledge graph, SubjectCardsView discoverability, and article-to-source linking.

---

### 1. Synchronous examiner profile cache (per categoryId, TTL)

**Problem**: `useCardAnnotations.getCachedExaminerProfile` triggers an async IDB read on first miss and returns `undefined`, so the very first `calculateNextReview` of a session ignores examiner adaptation.

**Solution**: Prime the cache synchronously from `categoryRecords` (already in memory in `AppContext`), keep the 30s TTL, and refresh in background. No new loading UI.

- Export a small module `src/lib/examiner-profile-cache.ts`:
  - `primeExaminerProfile(categoryId, profile)` — sync set
  - `getExaminerProfileSync(categoryId)` — returns last known value, never async
  - `bumpExaminerProfile(categoryId)` — invalidate
- In `AppContext` (where `categoryRecords` is loaded / mutated), call `primeExaminerProfile` for every record on load and after edits via `useCategoryManagement` examiner-profile mutations.
- Replace `getCachedExaminerProfile` in `useCardAnnotations.ts` with `getExaminerProfileSync` — no more async refresh path inside the patcher.

### 2. Reason codes for adaptive scheduling

**Problem**: `computeAdaptiveModifiers` silently boosts retention / shrinks intervals; nothing surfaces *why*.

**Solution**:
- Extend `AdaptiveModifiers` in `src/lib/spaced-repetition.ts` with `reasons: AdaptiveReason[]`, where each reason is `{ code: string; label: string; retentionDelta: number; intervalFactor: number }`. Codes: `FREQ_CESTO`, `FREQ_RIJETKO`, `FREQ_NIKAD`, `EXAM_PREF_MATCH_ESEJ`, `EXAM_PREF_MATCH_DEFINICIJA`, `EXAM_PREF_MATCH_POTPITANJA`, `EXAM_DIFF_TEZAK`, `EXAM_DIFF_LAK`.
- Extend `ReviewLogEntry` (in `src/lib/storage.ts`) with optional `reasons?: { code: string; label: string }[]` plus `effectiveRetention?: number` and `intervalMultiplier?: number`. Capture at log time inside `reviewSection`.
- Add a small **debug panel** `src/components/review/AdaptiveReasonPanel.tsx` that, given a card+section, shows the live modifiers + reason chips. Embed it inside `ReviewCard.tsx` behind a collapsible "Zašto ovaj interval?" toggle.
- Render the reasons list inside the existing review history view (search for any existing review log UI; otherwise add a compact list under each entry). Backwards-compatible: old entries without `reasons` simply render nothing extra.

### 3. Zettelkasten backlinks

**Problem**: When viewing an article, you can follow `[[Title]]` outward but not see who links *into* it.

**Solution**:
- In `ZettelkastenView.tsx` editor view, compute `backlinks` for the active article:
  ```ts
  const re = /\[\[([^\]]+)\]\]/g;
  const norm = activeArticle.title.trim().toLowerCase();
  const backlinks = articles.filter(a =>
    a.id !== activeArticle.id &&
    Array.from(a.content.matchAll(re)).some(m => m[1].trim().toLowerCase() === norm)
  );
  ```
- Add a right-side or bottom panel "Backlinks (N)" listing each linker with title + 1-line snippet around the link; clicking sets `activeId`.
- Listen for title changes (already routed through `handleUpdate`) — backlinks recompute via `useMemo([articles, activeArticle?.title])`.

### 4. Search & tag/source filters in SubjectCardsView (Pregled tab)

**Problem**: `CardViewFilterBar` only filters by subcategory/chapter/type/tag dropdowns; no text search and no linked-source filter.

**Solution**:
- Add a global text input at the top of the **Pregled** tab in `SubjectCardsView.tsx` (above `CardViewMode`), bound to a new local `query` state, plus a `linkedSourceFilter` select populated from `getSourcesByCategory(categoryId)`.
- Pass these through a new optional prop on `CardViewMode` (`externalFilters?: { query: string; linkedSourceId: string | "__all__" }`) consumed by `useCardViewFilters` to filter cards where:
  - `query` matches `card.question` or any `section.title/content` (case-insensitive),
  - `linkedSourceId` matches `card.sourceId` (the existing field linking a card to a source — verify exact field name during implementation; fallback: `card.linkedSourceIds`).
- Tag filter already exists in `CardViewFilterBar` — leave as is. Add a small "Aktivni filteri" chip row to clear the new filters.
- Keep change scope minimal — no refactor of `CardViewMode` props beyond the new optional input.

### 5. Manage `linkedSourceIds` from Zettelkasten UI

**Problem**: Articles have `linkedSourceIds` in the schema but no UI to manage or display them.

**Solution**:
- In `ZettelkastenView.tsx` editor view, add a "Povezani izvori" toolbar between title and editor:
  - Multi-select popover listing sources from `loadSourcesByCategory(categoryId)` (titles only).
  - Selecting/deselecting calls `handleUpdate({ linkedSourceIds })`.
  - Shows current selections as removable chips.
- In `ZettelPreview.tsx`, accept an optional prop `linkedSources: { id: string; title: string }[]` and render a "Izvori" footer block (list of clickable chips). Clicks emit `onSourceClick(id)` which the view wires to `navigate('/subject/:categoryId?source=' + id)` (use existing source-reader route if present; otherwise just open `SourceReader` modal — verify route during implementation).

---

### Files to create

- `src/lib/examiner-profile-cache.ts`
- `src/components/review/AdaptiveReasonPanel.tsx`
- `src/components/zettelkasten/BacklinksPanel.tsx`
- `src/components/zettelkasten/LinkedSourcesPicker.tsx`

### Files to edit

- `src/lib/spaced-repetition.ts` — add `reasons` to modifiers + return alongside computed values
- `src/lib/storage.ts` — extend `ReviewLogEntry` with optional `reasons`, `effectiveRetention`, `intervalMultiplier`
- `src/hooks/useCardAnnotations.ts` — use sync cache, capture reasons in log entry
- `src/contexts/AppContext.tsx` — prime examiner cache when categoryRecords load/change
- `src/components/review/ReviewCard.tsx` — embed AdaptiveReasonPanel
- `src/views/ZettelkastenView.tsx` — backlinks panel, linked-sources picker, pass to preview
- `src/components/zettelkasten/ZettelPreview.tsx` — render linked sources footer
- `src/views/SubjectCardsView.tsx` — text search + linked-source filter UI on Pregled tab
- `src/hooks/useCardViewFilters.ts` — accept external `query` + `linkedSourceId` filters

### Backwards compatibility

- `ReviewLogEntry.reasons` is optional → no migration needed.
- `KnowledgeBaseArticle.linkedSourceIds` already exists (defaults to `[]`).
- Examiner cache change is internal; behaviour is strictly improved (sync vs delayed).
- No DB schema bump required.
