# PR-7a — In-place Source Editing + BubbleMenu

Replace fragile `window.getSelection()` + `document.execCommand` pipeline in `SourceContent` and the legacy `TextSelectionTooltip` in card views with TipTap-native `<BubbleMenu>` mounted over the `<EditorV4>` editor instance.

---

## Milestone 1 — Expose editor instance from EditorV4

`src/components/editor-v4/EditorV4.tsx`
- Extend `EditorV4Handle` with `getEditor: () => Editor | null`.
- New prop `editable?: boolean` (default `true`). Pipe into `useEditor({ editable })`.
- Force a single re-render after mount so parents using `editorRef.current?.getEditor()` actually see the instance (small `mounted` state ticked in a one-shot `useEffect`, or expose via `onCreate` callback prop).
- Re-export `Editor` type from `@tiptap/react` through `editor-v4` barrel so consumers don't import tiptap directly.

`src/lib/editor-v4/extensions/key-part.ts`
- Add `addCommands()` exposing `setKeyPart`, `unsetKeyPart`, `toggleKeyPart` (chain-friendly). Update TipTap `Commands` declaration so `editor.chain().toggleKeyPart()` is typed.

---

## Milestone 2 — `<SourceBubbleMenu>` (in-place editing)

`src/components/source-reader/SourceBubbleMenu.tsx` (new)

```text
Props: { editor: Editor; editMode: boolean;
         onSplit: (text: string, html: string) => void;
         onLinkToExisting: (text: string, html: string) => void;
         onAddMnemo: (text: string) => void; }
```

Renders `<BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: "top" }}>` with two button groups:
- **Always:** Split (PenSquare), Link postojećem (LinkIcon), Mnemo kuka (Brain).
- **`editMode === true` only:** H1, H2, H3, ¶, •, 1., Key Part (`toggleKeyPart`).

Click handlers extract `from/to` from `editor.state.selection`, compute `text = doc.textBetween(from, to, "\n")` and `html = docToHtml({ version:4, content: editor.state.doc.cut(from, to).toJSON() as JSONContent })` (use existing `docToHtml` codec). The Heading/list buttons use `editor.chain().focus().toggleHeading({ level }).run()` and `toggleBulletList`/`toggleOrderedList`. `onMouseDown` preventDefault so click doesn't collapse the selection.

`shouldShow` callback: hide when selection empty OR selected text < 5 chars (parity with old tooltip).

---

## Milestone 3 — Refactor `SourceContent` + `SourceReader`

`src/components/source-reader/SourceContent.tsx` (rewrite)
- Drop legacy: `contentEditable`, `execCommand` paste handler, `enhanceHeadings` ref, `SourceEditToolbar`, `onMouseUp`, `dangerouslySetInnerHTML`. Drop `html`, `onMouseUp`, `contentRef`, `onFormat`, `onInput` props.
- New props: `source`, `editMode`, `onSourceUpdated`, `onSplit`, `onLinkToExisting`, `onAddMnemo`, `editorRef` (forwarded).
- Mount `<EditorV4 ref={editorRef} initialDoc={source.contentDoc ?? htmlToDoc(source.htmlContent)} editable={editMode} onChange={handleAutoSave} categoryId={source.categoryId} embedKind="source" />` inside `prose` wrapper.
- `handleAutoSave(doc)` → debounced (1s, `taskScheduler.debounce`) call to a new `persistSourceDoc(source, doc, onSourceUpdated)` helper in `src/lib/services/sourceEditingService.ts` that writes `contentDoc = doc` and derives `htmlContent = docToHtml(doc)` before `saveSource(...)`. Mirror via `usePersistedDraftMirror` keyed on doc JSON hash.
- Heading anchor icons: post-render decoration on the editor root (small `useEffect` querying `[data-heading-id]` inside the ProseMirror DOM) — keeps navigation parity.

`src/components/SourceReader.tsx`
- Replace `SourceTooltip` + `SourceContextMenu` mount with `<SourceBubbleMenu editor={editor} editMode={editMode} onSplit={...} onLinkToExisting={...} onAddMnemo={...} />`.
- `const [editor, setEditor] = useState<Editor|null>(null)` populated via `useEffect(() => { setEditor(editorRef.current?.getEditor() ?? null); }, [editorRef.current])` (or pass an `onEditorReady` prop to EditorV4 for clean wiring).
- Wire BubbleMenu callbacks to existing `useSourceMapping` handlers (`handleConvertToEssay`, `handleLinkToExisting`) — adapt their signatures: read `text`/`html` from BubbleMenu, not from `useSourceReaderStore.selection`. The `selection` store field becomes unused.
- Remove `SourceTooltip` import, `headingMenu`, `selection`, `handleContextMenu`, `handleMouseUp` from the JSX path. Keep `ExamSidebar` + `examQuestions` wiring; `onMapSelection` reads from the new editor selection via a `getEditorSelection()` helper passed to ExamSidebar (returns `{text, html}` from current TipTap selection).

`src/hooks/source-reader/useSourceEditing.ts`
- Strip `handleSetHeading`, `handleFormatAsList`, `handleFormatSelectionAs`, `handleContextMenu`, `handleInlineFormat`, `handleEditInput` (all are TipTap commands now).
- Keep `handleAutoFormatArticles` (file-wide regex transform stays; ports to operate on `contentDoc` via `docToHtml → transform → htmlToDoc`).
- Remove `draftHtml` state and `persistDebounced` over `innerHTML`; new autosave lives in `SourceContent`.

`src/hooks/source-reader/useSourceSelection.ts` — **delete file**. Its only job (DOM selectionchange + click-away) is now handled by TipTap.

`src/hooks/useSourceReaderActions.ts` — drop `useSourceSelection` import, `contentRef`, `handleMouseUp` from the facade return; drop the stripped editing methods. `derived.safeHtml` no longer needed.

`src/components/source-reader/SourceTooltip.tsx`, `SourceContextMenu.tsx`, `SourceEditToolbar.tsx` — **delete**.

---

## Milestone 4 — Migrate card views off `TextSelectionTooltip`

`src/components/learn/StudyModeRecall.tsx`, `src/components/card-list/CardRow.tsx`:
- Replace `<TextSelectionTooltip>{html}</TextSelectionTooltip>` with `<CardSelectionEditor html|contentDoc={section} cardMeta={...} onMarkKeyPart={...} />`.

`src/components/card-list/CardSelectionEditor.tsx` (new)
- Mounts `<EditorV4 editable={false} initialDoc={...} />` (TipTap BubbleMenu works fine on `editable:false` editors — selection still tracked).
- Mounts `<CardBubbleMenu editor={editor} onAddMnemo={...} onMarkKeyPart={...} />`.

`src/components/card-list/CardBubbleMenu.tsx` (new)
- Buttons: **Mnemo kuka** (always) + **Key Part toggle** (only when `onMarkKeyPart` provided AND parent passes `editable` prop hinting the card supports key-part marking).
- Mnemo handler reuses `createMnemonicCardFromSelection` + `saveMnemonicCards` (logic lifted from `TextSelectionTooltip`).
- Key-part: parent provides `onMarkKeyPart(text)` — same callback shape, so `useCardAnnotations` is untouched.

`src/components/TextSelectionTooltip.tsx` — **delete** after the two callsites are migrated.

---

## Milestone 5 — Tests & verification

- New: `src/test/source-reader-in-place.test.tsx` — mount `SourceReader`, programmatically set TipTap selection, assert `SourceBubbleMenu` buttons fire `onSplit`/`toggleHeading`/`toggleKeyPart`.
- New: `src/test/card-bubble-menu.test.tsx` — verify Mnemo kuka writes to mnemonic storage, Key Part toggles call `onMarkKeyPart`.
- Update: existing `source-reader-build-essay.test.ts`, `selection-split.test.ts`, `selection-split-manual.test.ts` — feed `text + docToHtml(slice)` instead of DOM-derived HTML; assertions on payload shape stay the same.
- Update: any test importing `SourceTooltip` / `useSourceSelection` / `TextSelectionTooltip`.
- Run `bunx tsc --noEmit` and `bunx vitest run` — full green required before merge.

---

## Files at a glance

```text
NEW
  src/components/source-reader/SourceBubbleMenu.tsx
  src/components/card-list/CardSelectionEditor.tsx
  src/components/card-list/CardBubbleMenu.tsx
  src/lib/services/sourceEditingService.ts  (persistSourceDoc helper)
  src/test/source-reader-in-place.test.tsx
  src/test/card-bubble-menu.test.tsx

EDIT
  src/components/editor-v4/EditorV4.tsx        (handle.getEditor, editable prop, onEditorReady)
  src/lib/editor-v4/extensions/key-part.ts      (addCommands)
  src/lib/editor-v4/index.ts                    (re-export Editor type)
  src/components/source-reader/SourceContent.tsx (full rewrite)
  src/components/SourceReader.tsx               (BubbleMenu wiring)
  src/hooks/source-reader/useSourceEditing.ts   (slim to autoFormatArticles)
  src/hooks/useSourceReaderActions.ts           (facade cleanup)
  src/components/learn/StudyModeRecall.tsx
  src/components/card-list/CardRow.tsx
  existing source-reader / smart-split tests

DELETE
  src/components/TextSelectionTooltip.tsx
  src/components/source-reader/SourceTooltip.tsx
  src/components/source-reader/SourceContextMenu.tsx
  src/components/source-reader/SourceEditToolbar.tsx
  src/hooks/source-reader/useSourceSelection.ts
```

## Architectural invariants preserved
- No `window.getSelection()` / `document.execCommand` in any modified file.
- `contentDoc` (AST) is SSOT; `htmlContent` derived via `docToHtml`.
- Autosave debounced through `taskScheduler` + `usePersistedDraftMirror`.
- Card mutations still flow through existing card-action hooks (`onMarkKeyPart`).
- Smart-Split wizard contract unchanged — receives `text + html`.
