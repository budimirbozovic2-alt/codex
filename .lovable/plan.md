
# PR-5 — Write path #1: card sections (TipTap EditorV4)

Cilj: zamijeniti legacy `RichTextEditor` (contenteditable + execCommand + DOMPurify-on-input) sa novim `<EditorV4 />` baziranim na TipTap-u v3, propagirati `contentDoc` (JSON AST) kao primarni payload kroz `useSectionEditor` → `useCardActions` → `useCardCRUD` → `cardRepository`, dok `content: string` (HTML) ostaje izvedeno polje preko `docToHtml` dok read-path-ovi ne pređu u potpunosti na AST (PR-6).

## 1. Nova komponenta `<EditorV4>`

Fajl: `src/components/editor-v4/EditorV4.tsx`

Props:
```ts
interface EditorV4Props {
  /** Initial document. Ako se promijeni `key`, editor se remountuje sa novim sadržajem. */
  initialDoc: EditorDoc;
  /** Pozvano na svaki update sa novim AST-om. */
  onChange: (doc: EditorDoc) => void;
  placeholder?: string;
  /** Minimal toolbar (bold/italic/list samo) — za pitanje i flash answer. */
  minimal?: boolean;
  /** Ako je `true`, dodaj "Označi kao ključni dio" toggle dugme. */
  showKeyPartToggle?: boolean;
  className?: string;
}
```

Interno:
- `useEditor({ extensions: [...editorV4Extensions, Placeholder.configure({ placeholder })], content: initialDoc.content, editable: true, immediatelyRender: false, onUpdate: ({ editor }) => onChange({ version: 4, content: editor.getJSON() }) })`.
- Reuse `editorV4Extensions` (single source of truth — schema = read-path = write-path).
- Toolbar (lucide-react ikone, design tokens):
  - Bold / Italic — uvijek vidljivo.
  - Underline (StarterKit ne uključuje) — dodaj `@tiptap/extension-underline` (već u package.json).
  - Heading 3 toggle.
  - Bullet / Ordered list.
  - Highlight (žuti `<mark>`).
  - KeyPart toggle — samo ako `showKeyPartToggle === true`.
  - Undo / Redo (ChevronLeft/Right ili dedicated ikone) — `editor.chain().focus().undo().run()`.
- Komande idu kroz TipTap chain — niti jedan poziv `document.execCommand`, niti `dangerouslySetInnerHTML`.
- Markdown shortcuts (`**bold**`, `# heading`, `- list`, `1.` itd.) — StarterKit ih daje ugrađeno; ne treba custom `tryMarkdownAutoFormat`.
- Paste rules: dodati `editor.setOptions({ editorProps: { handlePaste: ... } })` koji vrti istu MIME-allowlist sliku kao stari RTE (`image/png|jpeg|gif|webp`), ostalo prosljeđuje TipTap-ovom default paste-u koji koristi schema-bound DOMParser (nema XSS surface-a).
- `Placeholder` ekstenzija prikazuje `placeholder` kad je dokument prazan; CSS preko `.ProseMirror p.is-editor-empty::before`.
- `useEffect` cleanup → `editor.destroy()`.
- Re-export u `src/lib/editor-v4/index.ts` kao convenience nije potreban; `<EditorV4>` je čisto UI sloj pa živi u `components/`.

Wiki-link autosuggest:
- **Out of scope za PR-5** u card formi: kartice ne dijele Zettelkasten title-bus i nemaju listu mete-naslova u svom kontekstu. WikiLink ekstenzija je već u schema-i (round-trip radi), ali UI suggester ide u PR-7 (kad write-path stigne do articles).

## 2. Proširenje `SectionInput`

Fajl: `src/hooks/card-actions/validation.ts`

```ts
export interface SectionInput {
  title: string;
  /** Legacy HTML — izvedeno iz contentDoc preko docToHtml na save-u. */
  content: string;
  /** V4 AST — primarni payload od PR-5 nadalje. */
  contentDoc?: EditorDoc;
}
```

`validate(...)` ostaje na `stripHtmlText(content)` (sigurno radi sa `docToHtml(contentDoc)` rezultatom).

## 3. `useSectionEditor`

Fajl: `src/hooks/card-actions/useSectionEditor.ts`

Promjene:
- Inicijalizacija sekcija iz `editCard`: ako `s.contentDoc` postoji, koristi ga; inače `htmlToDoc(s.content)` kao seed (ne pišemo nazad, samo za editor).
- Inicijalizacija pitanja / flashAnswer: hold both `question` (string-HTML, legacy) i `questionDoc` (EditorDoc); isto za `flashAnswer` / `flashAnswerDoc`.
- Novi setter `updateSectionDoc(index, doc)` koji:
  1. `setSections(prev => prev.map((s, i) => i === index ? { ...s, contentDoc: doc, content: docToHtml(doc) } : s))`.
  2. Time `content` ostaje sinhron izvod (PR-4 read fallback nastavlja raditi).
- Postojeći `updateSection(i, "content", value)` se zadržava ali se više ne zove iz EditorV4 — koristi se samo za `handleCut`-style derivate. Sa AST puta, EditorV4 emituje preko `updateSectionDoc`.
- `handleCut`: kalkulacija ostaje preko legacy HTML-a (`parseHtmlToParagraphs(content)`). Nakon splita, oba nova sadržaja se konvertuju nazad u doc: `contentDoc = htmlToDoc(content)` za pre/post komad. To čuva trenutno UX i ne zahtijeva ProseMirror node-splice logiku.

Setteri vraćeni iz hook-a: dodati `updateSectionDoc`, `setQuestionDoc`, `setFlashAnswerDoc`. Stari `setQuestion` / `setFlashAnswer` ostaju (drugi consumeri).

`draftSnapshot` (autosave): proširiti sa `sectionDocs?: EditorDoc[]`, `questionDoc?`, `flashAnswerDoc?`. `applyDraft` ih primjenjuje.

## 4. `useCardActions` + `useCardCRUD`

`useCardActions.handleSubmit` već prosljeđuje `editor.sections` u `onSave`/`onUpdate`. Pošto sekcije sad nose `contentDoc`, signature ostaju kompatibilni (TypeScript struktura `{title, content, contentDoc?}` je supertip).

`src/hooks/useCardCRUD.ts`:
- `addCard.sections` tip: `Array<{ title: string; content: string; contentDoc?: EditorDoc }>`.
- `updateCard.updates.sections` isti tip.
- Mapping prilikom kreiranja sekcije:
  ```ts
  c.sections = sections.map((s, idx) => {
    const base = createSection(s.title, s.content);
    if (s.contentDoc) base.contentDoc = s.contentDoc;
    return base;
  });
  ```
- U `updateCard`, granu "existing section" izmijeniti:
  ```ts
  if (existing) return { ...existing, title: s.title, content: s.content, contentDoc: s.contentDoc ?? existing.contentDoc };
  ```
- `createSection(title, content, contentDoc?)` — proširiti potpis (default ostaje undefined).

`src/lib/sr/factories.ts`:
- `createSection(title, content, contentDoc?: EditorDoc)` postavlja `contentDoc` ako je prošlo.
- `createCard(question, sections, ...)` se ne mijenja semantički; samo `sections` mapiranje prosljeđuje `s.contentDoc`.

## 5. `EditorSection.tsx`

- `import RichTextEditor` → `import { EditorV4 }`.
- Question: `<EditorV4 minimal initialDoc={questionDoc} onChange={setQuestionDoc} placeholder={...} />`.
  - `questionDoc` se računa iz `question` lazy: `useMemo(() => htmlToDoc(question), [question])` ako trenutni hook ne pruža `questionDoc` direktno. Bolje: hook već daje `questionDoc`.
- Flash answer: isto, sa toolbar-om (ne-minimal).
- Sections content: `<EditorV4 initialDoc={section.contentDoc ?? htmlToDoc(section.content)} onChange={(doc) => updateSectionDoc(i, doc)} showKeyPartToggle />`.
- CuttingView (paragraf splitter) ostaje na `SafeHtml` — UI je preview-only.
- Prop tip `EditorSectionProps` proširen sa `updateSectionDoc`, `setQuestionDoc`, `setFlashAnswerDoc`.

`CardForm` (caller) prosljeđuje nove settere iz `useCardActions`.

## 6. Postojeći ne-card consumeri RichTextEditor-a

`RichTextEditor` se još koristi u:
- `src/components/source-reader/smart-split/ModuleCard.tsx`
- `src/components/source-reader/SmartSplitSummaryDialog.tsx`

Oni **ostaju na RichTextEditor-u** za PR-5 (out of scope; write-path za source/article ide u PR-6 i PR-7). Time se izbjegava ripple-efekat i čuva fokus.

## 7. Sanitizacija / sigurnost

- TipTap schema je whitelist-based — nepostojeći node-ovi i mark-ovi se odbacuju pri `setContent` / `generateJSON`. Nema render-time `dangerouslySetInnerHTML`.
- `docToHtml` emituje strukturisani markup za `content` polje; legacy SafeHtml read-grana (`ContentRenderer`) i dalje propušta kroz DOMPurify (defense-in-depth).
- Paste image MIME allowlist se zadržava bitno-bitno.

## 8. Testovi

Postojeći test `src/test/auto-split-import-phase.test.tsx` (jedini koji koristi `addCard`) ne smije pasti — `addCard.sections` ostaje string-tip i contentDoc je optional.

Novi: `src/test/editor-v4-cards.test.tsx`
- Render `<EditorV4 initialDoc={htmlToDoc("<p>hello</p>")} onChange={spy} />` u test env-u; tipkanjem `editor.commands.insertContent("X")` provjeriti da `onChange` dobije validan `EditorDoc` sa `version: 4`.
- Toggle bold preko `editor.chain().toggleBold().run()` → onChange JSON ima `marks: [{type:"bold"}]`.
- Round-trip sanity: `docToHtml(htmlToDoc("<p><strong>a</strong></p>"))` daje semantički ekvivalentan HTML.
- `useSectionEditor.updateSectionDoc(0, doc)` mijenja i `section.contentDoc` i `section.content`.
- `useCardCRUD.addCard(..., [{title, content, contentDoc}])` perzistuje contentDoc na Section-u (mock cardRepository.put, assert payload).
- `useCardCRUD.updateCard` na postojećoj kartici sa sekcijama bez contentDoc i sa contentDoc — oba slučaja perzistiraju ispravno.

Smoke: cijeli vitest run mora ostati zelen.

## 9. Out of scope (rezervisano za naredne PR-ove)

- PR-6: write-path za sources (rich-text source editor) + read-path full flip na contentDoc; uklanjanje legacy `content` polja.
- PR-7: write-path za Zettelkasten articles + wiki-link suggester (popover sa fuzzy match listom postojećih title-ova).
- Sinhronizacija KeyPart mark-ova sa `card.keyParts: string[]` (trenutno se key parts highlight derivira iz separatnog array-a; PR-6 unificira).

## Tehničke napomene

- `@tiptap/extension-placeholder` se već nalazi u dependencies — samo se importuje.
- `Placeholder.configure({ placeholder, emptyEditorClass: "is-editor-empty" })`; CSS u `index.css`:
  ```css
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: hsl(var(--muted-foreground));
    float: left;
    pointer-events: none;
    height: 0;
  }
  ```
- `Underline` ekstenzija — TipTap v3 StarterKit ne uključuje underline mark; importovati iz `@tiptap/extension-underline`.
- Highlight ekstenzija je već u `editorV4Extensions`.
- `useEditor` lifecycle: `initialDoc` se postavlja samo na mount; izmjene `initialDoc` ne re-triggeruju `setContent` (jer bi to gazilo korisnikov live tipkanje). Forsiranje reseta = parent dodaje `key={editingId}`. EditorSection već koristi unique `key={i}` po sekciji, dovoljno.
- Caret/scroll: `editor.options.editorProps.attributes.class = "ProseMirror min-h-[100px] focus:outline-none"` — bez promjene fokusne logike u parent-u.

