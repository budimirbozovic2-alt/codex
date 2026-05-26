
# Architect's Audit Report — Post PR-7b

> Scope: read-only audit. No code changes proposed; only specific files / lines / refactor targets. Brutally honest.

---

## 1. Hidden Bugs & Regressions ("The Gotchas")

### 1.1 The "Obsolete UI Deletion" claim is **false** — legacy editor is still live

`src/components/RichTextEditor.tsx` (304 lines) was **not** deleted. It is still:
- imported eagerly by `src/components/source-reader/smart-split/ModuleCard.tsx:3`, `:61`, `:105`
- imported eagerly by `src/components/source-reader/SmartSplitSummaryDialog.tsx:5`, `:133`
- lazy-imported by `src/features/mnemonic/workshop/WorkshopCardItem.tsx:19`, `:143`

This file is the source of all the supposedly-removed `document.execCommand` / `window.getSelection()` calls (lines 13, 73–88, 118, 149, 174, 184, 188, 203, 209, 236, 250). Until those three consumers are migrated to `<EditorV4>`, the entire legacy DOM-selection / execCommand surface is still mounted in production whenever Smart-Split, the Smart-Split summary, or the Mnemonic workshop opens.

Same story for `<SafeHtml>` (`src/components/ui/safe-html.tsx`) and `highlight-key-parts.ts` — both still referenced by `ZettelPreview`, `ContentRenderer`, `GlobalSearch:275`, `LinkToExistingCardModal:88`, `ReviewCard:255`. PR-7b did not delete them.

### 1.2 `withDerivedText` shim does not exist in the codebase

The prompt describes a "Compatibility Shim `withDerivedText`". A repo-wide search returns **zero** hits. What actually exists is `src/lib/editor-v4/derived.ts`, which exports `deriveHtml` / `deriveMarkdown` / `derivePlainText`. There is no Proxy/object-wrapping shim — consumers must call the derivers explicitly, which means any consumer that forgets is silently broken after the v22 column drop.

### 1.3 Hard-broken reads of dropped IDB columns (silent failure after v22)

After Dexie v22 physically deletes the columns, the following call-sites still expect them to be populated:

- `src/components/review/ReviewCard.tsx:255` — `<HighlightedSection content={section.content} ...>`. `section.content` is now optional and will be `undefined` for any row written post-v22 → `HighlightedSection` renders empty for new reviews. This is a **user-visible regression in the review flow**.
- `src/components/category/CardViewTable.tsx:189` — `<ContentRenderer doc={section.contentDoc} html={section.content} />` will lose its fallback path; tolerable because `doc` exists, but `highlight={...}` branch only operates on `html`, so key-part highlights vanish in the table.
- `src/components/learn/StudyModeRecall.tsx:154`, `:205` — same pattern as CardViewTable.
- `src/components/zettelkasten/SourceSidePanel.tsx:21` — `sanitizeHtml(source.htmlContent ?? "")` → always empty string after v22 → side panel is blank.
- `src/lib/services/sourceEditingService.ts:46` — `autoFormatArticles(source.htmlContent)` → operates on undefined.
- `src/components/category/SourceEditor.tsx:114`, `:128–135` — reads `source.htmlContent` for diff/compare; the entire "needs review" diff path silently no-ops.
- `src/components/speed-reader/speed-reader-constants.ts:69` — `source.htmlContent || ""` → speed reader is blank on sources.
- `src/hooks/useAutoSplitImport.ts:59–60` — `detectArticles(source.htmlContent)` → auto-split detection returns 0 articles.
- `src/lib/auto-link-suggestion.ts:67` — `stripHtml(section.content)` → auto-link suggestions never match content.
- `src/hooks/zettelkasten/useArticleDraft.ts:197` — `article.content.trim()`. `article.content` is `string | undefined` now → **`.trim()` of undefined will throw `TypeError`**. Hard crash.
- `src/hooks/useCardCRUD.ts:142` — calls validation with `[{ title, content: section.content }]` (no `contentDoc`). Need to verify the persist path doesn't drop the AST.
- `src/lib/auto-split/import-planner.ts:117`, `:139` — writes only `content: sanitizeHtml(...)` without `contentDoc` despite the type now requiring it.

These are all silent failures, not type errors — TS still accepts them because `Section.content` was downgraded to optional in `src/lib/sr/types.ts:21`.

### 1.4 Type-safety loopholes around the AST boundary

`section.contentDoc` is declared **required** in `Section` (`src/lib/sr/types.ts:23`) but in practice may be missing on legacy rows that lazy-migration hasn't touched. The codebase routinely guards with `section.contentDoc ?? htmlToDoc(section.content || "")` (e.g. `SourceContent.tsx:31`, `EditorSection.tsx:190`). When the legacy `content` column is dropped, that fallback becomes `htmlToDoc("")` — a blank document, masking the fact that lazy migration was incomplete.

There is no runtime assertion that every read row was migrated; `preflight-telemetry.ts` is the only signal. **Recommend**: refuse to ship v22 unless preflight reports 0 unmigrated rows, or stash legacy `content`/`htmlContent` into a `legacy_blob` JSON column for one release as an escape hatch.

### 1.5 `EditorV4` editor instance leak on prop change

`src/components/editor-v4/EditorV4.tsx:85–92`: the `extensions` array is `useMemo`'d on `[placeholder]`. Any placeholder change rebuilds `extensions`, which means `useEditor` re-runs and instantiates a brand-new TipTap editor. The cleanup at `:177–182` uses `[]` deps so the cleanup closure captures the **first** editor only — subsequent editors created during the component's lifetime are never `.destroy()`-ed → ProseMirror view + DOM listeners + plugin state retained until tab is closed. Anywhere placeholder is computed from props (e.g. localized strings) leaks an editor per render-cycle.

The same pattern is in `useImperativeHandle` dep `[editor]` (line 175) which is correct, contradicting the cleanup's `[]`.

### 1.6 Dangling DOM listeners

After grepping `window.getSelection` / `document.execCommand` / `addEventListener`:

- `RichTextEditor.tsx` — 10+ direct selection / execCommand calls (see 1.1). Will go away when 1.1 is fixed.
- `src/hooks/mindmap/useNodeEditing.ts:65` — `document.addEventListener("pointerdown", handler, true)`. Cleanup exists; spot-checked OK.
- `src/lib/body-pointer-events-guard.ts:104` — `animationend` listener added globally with `true` capture; cleanup is conditional, worth re-verifying after the modal stack changes from PR-7b.
- `src/hooks/useDashboardData.ts:98` — `storage` listener — fine.
- `src/lib/persist-queue.ts:272` and `src/lib/db-queries.ts:192` — both register `visibilitychange` listeners at module scope (`document.addEventListener` outside any cleanup). These are intentional process-lifetime listeners but become real leaks in Vitest's jsdom between test files. Verify test cleanup.

### 1.7 TipTap NodeView cleanup

`src/lib/editor-v4/extensions/MindmapEmbedNodeView.tsx` renders `<EmbeddedMindMap>` which presumably subscribes to a `mindMaps` Zustand selector. The NodeView delegates unmount to `<NodeViewWrapper>`, which is fine, **but**:
- The NodeView reads `editor.storage.mindmapEmbed.categoryId` as a plain object property (line 14). `EditorV4.tsx:128–134` mutates this object in-place. If the host route swaps `categoryId` while the editor is open, the NodeView won't re-render (no React subscription) and the embedded map will keep rendering for the old subject.
- There is no `AbortSignal` plumbed into `EmbeddedMindMap`'s fetch path. If the user types fast and TipTap recreates the node (e.g. undo/redo recreates the embed), the in-flight fetch from the destroyed nodeview will still call `setState` on the new instance via the shared store. Confirm in `EmbeddedMindMap`.

### 1.8 `useCardSelectors` always runs both RAM and DB selectors

`src/store/useCardSelectors.ts:179–223`: every hook calls both `useCardsByCategoryRam` and `useCardsByCategoryFromDb` plus `useDualReadDiff` on every render. That's correct for the dual-read window, but it's still active in prod (`USE_DB` is captured once, but **both** selectors still subscribe). This doubles Dexie liveQuery cost across the whole UI. Gate the loser path behind a build-time flag once the cutover is done.

---

## 2. Performance Sub-Optimizations (Current State)

### 2.1 WeakMap caches in `derived.ts` — sound but coarse

`src/lib/editor-v4/derived.ts:20–22` defines three module-level `WeakMap<EditorDoc, string>`. Sound: keys are GC-collected with their docs; TipTap immutability guarantees a new object per edit, so invalidation is automatic. No leak.

Gaps:
- No telemetry for hit rate. With React StrictMode double-invoking renders and `useMemo` not always preserving doc identity through hook boundaries (e.g. `useArticleDraft` updates `draft = { ...prev, contentDoc: doc }` — same `doc` reference, so cache hits), it's worth instrumenting `deriveHtml` once to confirm hit-rate ≥ 95%.
- `isDocEmpty` (line 51) calls `derivePlainText` which fills the text cache. Calling `isDocEmpty` on every keystroke (to gate the placeholder) will populate the cache with one entry per keystroke — fine for GC but wasteful for compute when only the boolean is needed. Add an early-exit AST walker.

### 2.2 Synchronous overhead on the keystroke loop

`useSectionEditor.ts:52–56` (`updateSectionDoc`) is clean — no docToHtml on keystroke. ✅

But:
- `EditorV4.tsx:122` allocates `{ version: 4, content: editor.getJSON() }` on every keystroke. `editor.getJSON()` is a **deep clone** of the entire doc tree (TipTap walks the ProseMirror doc and produces new objects). For long sources / articles this is O(nodes) per keystroke. Consider memoizing via `editor.state.doc.eq` checks or only emitting on debounce for very long docs.
- `EditorSection.tsx:189` seeds `initialDoc` with `[]` deps and ignores `section.contentDoc` updates from outside. That's deliberate (uncontrolled editor), but it also means `handleCut` in `useSectionEditor.ts:68–97` re-builds `contentDoc` via `htmlToDoc` synchronously and relies on **React `key={i}`** to remount the editor. I see no `key` prop in `EditorSection`'s parent (need to verify in `CardForm`) — if missing, the new doc is silently ignored and the cut "doesn't happen" in the UI.
- `validation.ts:68` calls `stripHtmlText(s.content)` per section in the validator. After v22 `s.content` is undefined → validator passes garbage. Should derive from `contentDoc`.

### 2.3 React render cycles around `<EditorV4>`

`EditorSection` is `memo()`-wrapped (line 184) but its parent re-renders the entire `sections.map(...)` on every keystroke (because `sections` state changes). Memo helps **only if** every prop is referentially stable:
- `moveSection`, `removeSection`, `updateSection`, `updateSectionDoc`, `handleCut`, `setCuttingIndex` — all from `useSectionEditor`, all wrapped in `useCallback([])` ✅
- `section` — **new object reference per keystroke** (because `setSections(prev.map(...))` allocates) → memo break. Every keystroke re-renders every sibling section. For a 10-section card this is 10x the work.

Fix surface: replace `sections: SectionInput[]` with a `Map<id, Section>` selector model, and have each `<SectionEditor>` subscribe to its own slice. This is also the SQLite-prep refactor.

`<EditorView>` (read-only TipTap, `src/lib/editor-v4/EditorView.tsx`) — instantiated per ContentRenderer. In a 50-row `CardViewTable` you get 50 ProseMirror views, each with its own plugin state. Heavy. Consider:
- A pure JSX renderer for the read path (walk the AST → React nodes, no TipTap) for list/preview surfaces, OR
- Render the cached `deriveHtml` + `<SafeHtml>` in list contexts and reserve `<EditorView>` for full-page reads.

### 2.4 `useCardAggregates` cost

`src/contexts/cards/useCardAggregates.ts` already memoizes per-card via WeakMap (`summarizeCard`). Good. But the outer `useMemo` deps on `[cards, summarizeCard]` — `cards` is a brand-new array on every Zustand emit even when no card changed. Combine with `useDualReadDiff` runs and you get a full O(N) aggregation per render in `CardStateProvider`. Translate to SQL aggregates (see §3).

### 2.5 Backlink / search hot paths

You said hot scanners now traverse JSON AST. Verify:
- `src/lib/auto-link-suggestion.ts:67` is still calling `stripHtml(section.content)` — old path, broken (see 1.3). Should walk `contentDoc`.
- GlobalSearch indexes via `derivePlainText` presumably; spot-check it's not re-deriving per keystroke in the search box.

---

## 3. Preparation for OPFS SQLite + TanStack Query

### 3.1 "RAM is SSOT" bottlenecks to retire

| Today (RAM in Zustand) | Tomorrow (SQL + useQuery) |
|---|---|
| `cardMapStore` (`src/store/useCardMapStore.ts`) — whole `CardMap` in memory, ref-facade in-place mutation | `cards` table, `useQuery(['cards', filters])` with indexed `WHERE` |
| `useCardsByCategoryRam`/`Subcategory`/`Chapter` — `for (const id in map) if (predicate)` linear scan per render | `SELECT id, ... FROM cards WHERE category_id = ? [AND subcategory_id = ?]` with composite index `(category_id, subcategory_id, chapter_id)` |
| `useCardCountByCategoryRam` — manual counter loop | `SELECT COUNT(*) FROM cards GROUP BY category_id` cached by TanStack |
| `useCardAggregates` — per-card summarize + global reduce on every emit | View / prepared statements: `SELECT category_id, COUNT(*), AVG(score), SUM(CASE WHEN next_review <= now THEN 1 END) AS due FROM cards JOIN card_sections USING(card_id) GROUP BY category_id`. WeakMap summary cache becomes obsolete. |
| `useCardSelectorsFromDb` (Dexie liveQuery) — already declarative, easy port | Replace `useLiveQuery` with `useQuery` against SQLite + a manual invalidation bus subscribed to write txns |
| `useCardsBySource` (`src/store/useCardsBySource.ts`) | `WHERE source_id = ?` |
| Categories tree in `useCategoryStore.ts` — subcategories/chapters as **nested JSON arrays** mutated in place | Three tables `categories`, `subcategories`, `chapters` with `FK ... ON DELETE CASCADE` and `position INT` for ordering |
| `mindMaps` SSOT storage module | `mind_maps(category_id FK)` table |
| Sources SSOT storage module | `sources(category_id FK, content_doc TEXT)` |
| `backlinkIndex` in-RAM hash | `backlinks(source_id, target_id, kind)` table with index on both sides |
| `cardSummaryCacheRef` WeakMap in `useCardAggregates` | unnecessary — SQL aggregates |

### 3.2 Components directly subscribed to Zustand → must become `useQuery` consumers

Direct Zustand subscribers that own data-filtering logic (will need refactor to declarative queries):

- `src/contexts/cards/CardStateProvider.tsx` (wraps `useCardAggregates` and exposes it via context to the entire app) — biggest single rewrite. Should be deleted and replaced by per-component `useQuery`.
- `src/contexts/cards/useCardAggregates.ts` — see above; replaced by SQL.
- `src/components/category/CardViewTable.tsx` — currently consumes `useCardsByCategory/Subcategory/Chapter`. Becomes `useQuery({ queryKey: ['cards', { categoryId, subcategoryId, chapterId, sort, page }], queryFn })`.
- `src/components/GlobalSearch.tsx` — currently scans RAM cards/sources/articles. Becomes FTS5: a virtual table `cards_fts(question, plain_text, content=cards)` with triggers; `useQuery(['search', q])`.
- `src/components/subject-cards/PassiveReader.tsx` — reads whole-category cards from RAM for sequential rendering. Becomes a paginated query.
- `src/views/SubjectDashboard.tsx` / `SubjectDiagnosticsPage` (via granular RAM selectors) — port to `useQuery` aggregates.
- `src/hooks/useDashboardData.ts` — already does cross-category reductions; perfect candidate for a single SQL view.
- `src/hooks/usePlannerData.ts` — planner currently joins cards × reviewLogs × categories in JS; SQL with `JOIN` and date bucketing is dramatically faster.
- `src/hooks/useStatsData.ts`, `src/hooks/useHealthMonitor.ts` — orphan detection becomes `LEFT JOIN ... WHERE x.id IS NULL`.

### 3.3 Relational opportunities (NoSQL → SQL normalization)

Current TypeScript shapes (`src/lib/sr/types.ts`) hide several denormalizations that will bite once we go SQL:

| Field | Current | SQL design |
|---|---|---|
| `Card.sections: Section[]` | JSON array inside `cards` row | `card_sections(id PK, card_id FK ON DELETE CASCADE, position INT, title TEXT, content_doc TEXT)`. Unlocks per-section indexing, FSRS scheduling joins, partial loading. |
| `Card.tags?: string[]` | JSON array | `tags(id PK, name UNIQUE)` + `card_tags(card_id FK, tag_id FK, PRIMARY KEY composite)` |
| `Card.keyParts?: string[]` | JSON array | If query-required: `card_key_parts(card_id FK, text)`. If only render-time: leave in JSON column. |
| `Card.childCardIds?: string[]` | JSON array of FKs without integrity | `card_children(parent_id FK ON DELETE CASCADE, child_id FK ON DELETE CASCADE, position)` |
| `Card.sourceModules?: SourceModule[]` | JSON array | `source_modules(card_id FK, …)` |
| `Card.errorLog?: ErrorLogEntry[]` | JSON in row | `card_errors(card_id FK, text, count, last_missed, …)` with composite index `(card_id, text)` |
| `categories.subcategories[].chapters[]` | nested JSON | `subcategories(id PK, category_id FK ON DELETE CASCADE, position)` + `chapters(id PK, subcategory_id FK ON DELETE CASCADE, position)` |
| ReviewLog | append-only JSON log | `review_logs(id PK, card_id FK, section_id FK, grade, reviewed_at, …)` — partitioning + monthly archive becomes trivial |
| Backlinks (currently `backlinkIndex` rebuilt from RAM) | derived index | `backlinks(source_id FK, target_id FK, kind, PRIMARY KEY (source_id, target_id))` populated by write-side triggers; replaces `backlinkIndex.rebuildFromAll` |
| Sections' `contentDoc` | JSON blob | Keep as `TEXT` (JSON). Add **denormalized columns** populated by application before write: `plain_text` (for FTS), `html_cached` only if list rendering can't afford TipTap walk. Or — better — `cards_fts` FTS5 virtual table over `plain_text` with contentless mode. |
| `Source.htmlContent` (post v22: gone) | — | `sources(id PK, category_id FK ON DELETE CASCADE, content_doc TEXT, plain_text TEXT GENERATED ALWAYS)` |

Other things SQL will surface:
- `Card.categoryId` / `subcategoryId` / `chapterId` are nominally FKs but never enforced. After v22 + SQL they become real `FOREIGN KEY ... ON DELETE CASCADE`. Today's `categoryDeletionService` orchestration becomes a single `DELETE FROM categories WHERE id = ?`.
- `position`/ordering today is derived from array index in nested JSON; SQL needs explicit `position INT` columns with unique-per-parent constraints.

### 3.4 Migration sequencing recommendation

1. **First**, complete PR-7b honestly: delete `RichTextEditor`, `SafeHtml`, `ContentRenderer` fallback, and fix the 11 broken read-sites in §1.3. Until then SQLite migration sits on top of unstable foundations.
2. Introduce a thin **DAO layer** (`src/lib/db/queries/*`) that is the only Dexie consumer — wrap every `useLiveQuery` and every direct `db.cards.where(...)`. Components import DAOs, not Dexie. This is the seam where SQLite swaps in.
3. Rewrite `useCardAggregates` to consume the DAO with single-purpose queries (`useCountByCategory`, `useDueCards`). Delete the WeakMap cache.
4. Stand up a parallel OPFS SQLite store (`@sqlite.org/sqlite-wasm` + `vlcn` or `wa-sqlite`). Migrate writes dual-write Dexie→SQLite during a soak period (mirror of dual-read selectors today).
5. Wrap every DAO in TanStack `useQuery`; invalidate via a `queryClient.invalidateQueries(['cards', categoryId])` call inside write txn commit.
6. Cut over reads after dual-read parity is green for N days. Drop Dexie.

---

## Top-Priority Fixes Before Any New Work

1. Stop bleeding regressions: fix the 11 sites in §1.3 (any one of `ReviewCard:255`, `useArticleDraft:197`, `SourceSidePanel:21`, `auto-link-suggestion:67`, `useAutoSplitImport:59` is a user-visible break).
2. Plug the `EditorV4` editor leak in §1.5 (`useEffect(() => () => editor?.destroy(), [editor])`).
3. Decide: actually delete `RichTextEditor` / `SafeHtml` / `highlight-key-parts` (and migrate the 3 consumers in §1.1 to `<EditorV4>` / `<EditorView>`), or update PR-7b's narrative to admit they remain.
4. Drop the doubled-up `useDualReadDiff` cost in `useCardSelectors` once `USE_DB_LIVE_SELECTORS` is the decided winner.
5. Add a preflight gate: refuse v22 destructive drop unless `preflight-telemetry` reports 0 unmigrated rows.

