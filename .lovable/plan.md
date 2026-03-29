

# UI Restoration Part 3: DOCX Drag & Drop + Source Diff + Hidden Metadata

## Current State Assessment

| Feature | Backend Logic | UI Wired? |
|---------|--------------|-----------|
| DOCX parsing (mammoth) | `src/lib/docx-parser.ts` — full worker-based parser | **CategoryView has file input but NO drag & drop zone** |
| Source Diff Engine | `src/lib/article-parser.ts` — full `compareVersions()`, `getChangedArticleIds()`, `matchAnchorToArticle()`, `diffTexts()` | **NOT wired to any UI** |
| Card needsReview flagging | `bulkFlagNeedsReview()` in context + `confirmCardReview()` in SourceSnippetDialog | **Flag exists but never SET during source update** |
| SourceEditor DOCX upload | N/A | **Only has raw HTML textarea, no file upload** |
| Category color display | `CategoryRecord.color` exists, displayed in CategoryView header | **Already shown** (line 129-131) |
| needsReview badge in CardViewMode | N/A | **Not shown** — CardList shows it, CardViewMode doesn't |

## Plan (3 Actions)

### Action 1: Add Drag & Drop DOCX to SourceEditor "Update Text" Section
**File: `src/components/category/SourceEditor.tsx`**

Replace the plain `<Textarea>` in the "Ažuriraj tekst izvora" collapsible (lines 137-144) with a combined drop zone + textarea:

- Add a drag & drop zone that accepts `.docx` files
- On drop/select: use `parseDocxInWorker()` from `src/lib/docx-parser.ts` to extract HTML
- Populate the textarea with extracted HTML (user can review before saving)
- Show file name and loading spinner during parsing
- Keep the textarea as fallback for raw HTML paste

~30 lines added, textarea preserved.

### Action 2: Wire Source Diff Engine into SourceEditor Save Flow
**File: `src/components/category/SourceEditor.tsx`**

In `handleSave()`, when `newText` is provided (source text update):

1. Call `compareVersions(source.htmlContent, newHtmlContent)` from `article-parser.ts`
2. Call `getChangedArticleIds(diffResult)` to get modified/removed article IDs
3. For each card linked to this source (`sourceId === source.id`), call `matchAnchorToArticle(card.textAnchor, oldArticles)` to check if that card's anchor falls in a changed article
4. Collect affected card IDs → call `bulkFlagNeedsReview(affectedCardIds)` from context
5. Show a diff summary dialog BEFORE saving: "X članovi izmijenjeni, Y dodati, Z uklonjeni. W kartica označeno za provjeru."
6. User confirms → save proceeds

**New component: `src/components/source-reader/SourceDiffPreview.tsx`**
- Simple dialog showing diff summary + per-article status (color-coded: green=added, red=removed, yellow=modified)
- For modified articles: render diff segments with `<ins>`/`<del>` styling
- "Potvrdi i sačuvaj" button to proceed

**Props needed from context:** `bulkFlagNeedsReview` — add to SourceEditor via prop or import from `useCardActions()`.

### Action 3: Add needsReview Badge to CardViewMode
**File: `src/components/category/CardViewMode.tsx`**

In the card row (expanded detail section), add:
- If `card.needsReview === true`: show warning badge "⚠ Izvor ažuriran" in orange/warning color
- This already exists in CardList.tsx (the Scale icon on line 118) — replicate the pattern

## Files Modified
1. `src/components/category/SourceEditor.tsx` — Add DOCX drop zone + diff-on-save logic
2. `src/components/source-reader/SourceDiffPreview.tsx` — **NEW** — Diff summary dialog
3. `src/components/category/CardViewMode.tsx` — Add needsReview warning badge

## Technical Details

The diff engine is already complete in `article-parser.ts`:
- `compareVersions(oldHtml, newHtml)` → `DiffResult` with per-article diffs
- `getChangedArticleIds(diffResult)` → `Set<string>` of modified/removed article IDs
- `matchAnchorToArticle(anchor, articles)` → matches card's textAnchor to an article
- `diffTexts(old, new)` → character-level `DiffSegment[]` using diff-match-patch

Card flagging infrastructure:
- `bulkFlagNeedsReview(cardIds)` — sets `needsReview: true` on cards, persists to IDB
- `confirmCardReview(cardId)` — clears the flag (already wired in SourceSnippetDialog)

## Scope
- IDB schema: untouched
- Context providers: untouched (only consuming existing `bulkFlagNeedsReview`)
- Export/Import pipeline: untouched
- FSRS math: untouched
- SourceReader: untouched

