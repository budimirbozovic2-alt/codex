
# PR-7c: Audit Resolution

Execute the five milestones from the brief in strict order. Below is the per-file action map plus the gotchas I'll handle that aren't in the brief.

## M1 — EditorV4 leak

`src/components/editor-v4/EditorV4.tsx:177-182`
- Change cleanup `useEffect(..., [])` → `useEffect(..., [editor])` so each prior TipTap instance is `.destroy()`-ed when `extensions` (placeholder-derived) rebuilds the editor.
- Remove the stale `eslint-disable react-hooks/exhaustive-deps` comment.

## M2 — Eradicate legacy editors

### 2a. Migrate the three `<RichTextEditor>` consumers to `<EditorV4>`

- `src/components/source-reader/smart-split/ModuleCard.tsx` (2 call-sites)
- `src/components/source-reader/SmartSplitSummaryDialog.tsx`
- `src/features/mnemonic/workshop/WorkshopCardItem.tsx`

Contract change: `<RichTextEditor value={html} onChange={(html)=>...} />` becomes `<EditorV4 initialDoc={htmlToDoc(html)} onChange={(doc)=> setHtml(deriveHtml(doc))} minimal />`. Where consumers currently hold an HTML string in state, keep the string (for backwards compat with the surrounding smart-split / mnemonic pipelines), but derive it from the AST on each `onChange`. Long-term these stores should hold `contentDoc`; out of scope here.

### 2b. Migrate `<SafeHtml>` / `highlightKeyParts` consumers

- `src/components/ui/ContentRenderer.tsx` — collapse to AST-only: if `isV4Doc(doc)` render `<EditorView>`, else render `<EditorView doc={htmlToDoc(html)}>`. Drop the SafeHtml branch and the highlight prop's HTML-mutating path (key-parts are stored as `keyPart` marks in AST).
- `src/components/GlobalSearch.tsx:275` — `highlightMatch` returns a small HTML string with `<mark>` wrappers for the matched substring. Replace `<SafeHtml as="span" html={...} trusted>` with a small inline component that splits the title on the query and renders `<mark>` JSX nodes directly (no HTML string, no sanitizer needed).
- `src/components/LinkToExistingCardModal.tsx:88` — same pattern: render the snippet via `<EditorView doc={card.sections[0]?.contentDoc} />` or via inline JSX from `derivePlainText`.
- `src/components/zettelkasten/ZettelPreview.tsx` — replace both `<SafeHtml>` and the legacy markdown-string branch with `<ContentRenderer doc={doc} />` (now AST-only).
- `src/components/review/ReviewCard.tsx:255` — replace `<HighlightedSection content={section.content} keyParts={card.keyParts} ...>` with `<EditorView doc={section.contentDoc} className="...">`. KeyPart marks are already in the AST, so the EditorView CSS for `.key-part-highlight` renders them automatically.

### 2c. Delete files (last, after all imports are gone)

- `src/components/RichTextEditor.tsx`
- `src/components/ui/safe-html.tsx`
- `src/lib/highlight-key-parts.ts`
- Tests that imported them: `src/test/highlight-key-parts.test.ts` → delete.

## M3 — Fix the 11 silent failures

| # | File | Fix |
|---|---|---|
| 1 | `src/components/review/ReviewCard.tsx:255` | Covered by M2 (EditorView). |
| 2 | `src/components/category/CardViewTable.tsx:189` | Drop `html={section.content}` — pass `<ContentRenderer doc={section.contentDoc} highlight={...}>`. Highlight applied as marks already; remove HTML highlight branch. |
| 3 | `src/components/learn/StudyModeRecall.tsx:154,205` | Same — drop `html` prop. |
| 4 | `src/components/zettelkasten/SourceSidePanel.tsx:21` | `const html = useMemo(() => deriveHtml(source.contentDoc), [source.contentDoc])`. Drop `sanitizeHtml` (AST→HTML output is already schema-safe). |
| 5 | `src/lib/services/sourceEditingService.ts:46` | `autoFormatArticles(deriveHtml(source.contentDoc))`. |
| 6 | `src/components/category/SourceEditor.tsx:114,128-135` | Compute `const baseHtml = deriveHtml(source.contentDoc)` once, swap all `source.htmlContent` reads with `baseHtml`. |
| 7 | `src/components/speed-reader/speed-reader-constants.ts:69` | `const html = deriveHtml(source.contentDoc)` (heading segmentation still needs HTML structure). |
| 8 | `src/hooks/useAutoSplitImport.ts:59-60` | `detectArticles(deriveHtml(source.contentDoc))`, deps on `[open, source.contentDoc]`. |
| 9 | `src/lib/auto-link-suggestion.ts:67` | `const contentPlain = derivePlainText(section.contentDoc).toLowerCase()`. Also update the `stripHtml` helper if no other callers, otherwise keep it for the question field. |
| 10 | `src/hooks/zettelkasten/useArticleDraft.ts:197` | `if (article && opts?.autoEditEmpty && isDocEmpty(article.contentDoc))`. Removes the `.trim()` crash on undefined. |
| 11 | `src/lib/auto-split/import-planner.ts:117,139` | Already partially fixed in earlier turn — verify both card builders write `contentDoc: htmlToDoc(sanitizeHtml(art.contentHtml))` and not just `content: string`. |

## M4 — Preflight gate + selector cleanup

- `src/lib/db-schema.ts` v22 upgrade block: at the top, `if (typeof localStorage !== "undefined" && localStorage.getItem("v4_telemetry_healthy") !== "true") { throw new Error("[v22] aborted: preflight telemetry not healthy — lazy migration incomplete"); }`. Throwing aborts the Dexie upgrade transaction cleanly. (Electron-only guard: skip in non-Electron contexts per the user's previous "Forced backup failure policy" decision — gate with `isElectron()`.)
- `src/store/useCardSelectors.ts:179-223`: when `USE_DB` is true and `!DEV`, skip calling the RAM sibling hook by routing through a thin branch:
  ```ts
  if (USE_DB && !DEV) { return useCardsByCategoryFromDb(categoryId); }
  ```
  Hook order stays stable because the branch is determined by session-stable constants.

## M5 — Verification

- `bunx tsc --noEmit` — fix any straggler type errors from deleted modules.
- `bunx vitest run` — drop/adapt tests that imported deleted modules (`highlight-key-parts.test.ts`, any safe-html tests, RichTextEditor smart-split tests).
- Spot-check session: open Review, Smart-Split, SourceReader, Zettelkasten preview, GlobalSearch — confirm rendering works against AST-only payloads.

## Risks / decisions baked in

- `<EditorView>` per row in `CardViewTable` is heavier than the old `<SafeHtml>` path (one ProseMirror view per row). Acceptable for now; the audit's §2.3 lists a future "AST → React nodes" pure renderer as the proper fix. Out of scope for PR-7c.
- `GlobalSearch.highlightMatch` becomes a pure JSX function — no HTML string at all, so DOMPurify drops out of that call site cleanly.
- Smart-split / mnemonic stores keep HTML strings as their persisted shape. We only swap the editor surface; persisting AST is a separate refactor.
- Preflight gate throws — Dexie shows the error in the boot panic UI. That's the intended UX: "do not destroy data unless every row is migrated".
