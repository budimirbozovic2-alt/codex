
# PR-4 — Read path: render preko AST-a

Cilj: koristiti `contentDoc` (EditorDoc) kao read-path render gdje god postoji, sa SafeHtml fallback-om dok lazy-migrate ne pokrije sve zapise. DOMPurify ostaje samo na fallback grani.

## 1. Nova komponenta `<EditorView>`

Fajl: `src/lib/editor-v4/EditorView.tsx`

- TipTap `useEditor({ extensions: editorV4Extensions, editable: false, content: doc, immediatelyRender: false })`.
- Props: `{ doc: EditorDoc; className?: string; as?: "div" | "article"; }`.
- Bez toolbar-a, bez bubble menu-a, bez fokus side-effekata.
- `useEffect` cleanup → `editor.destroy()` na unmount.
- `useEffect` sync: kad se `doc` reference promijeni, `editor.commands.setContent(doc, { emitUpdate: false })`.
- Wrapper: `<EditorContent editor={editor} className={cn("ProseMirror", className)} />` — TipTap već dodaje `.ProseMirror` klasu, samo prosljeđujemo dodatne klase za prose.
- Re-export iz `src/lib/editor-v4/index.ts`.

Zašto TipTap a ne ručni AST walker: jedinstveni schema sa write path-om (PR-5), wiki-link/mindmap/key-part NodeView-i se sami rješavaju, nema dupliranja parsing logike.

## 2. `<ContentRenderer>` adapter

Fajl: `src/components/ui/ContentRenderer.tsx`

```
interface Props {
  doc?: EditorDoc | null;
  html: string;              // legacy fallback
  className?: string;
  /** Highlight key parts u fallback grani (HTML samo). */
  highlight?: { keyParts: string[] } | null;
  as?: "div" | "article";
}
```

Logika:
- ako `doc` postoji i `doc.version === 4` → `<EditorView doc={doc} className={className} />`
  - Napomena: key-parts u AST grani su već `keyPart` mark-ovi (KeyPart ekstenzija), pa `highlight` propsy ignorišemo.
- inače → `<SafeHtml html={highlight ? highlightKeyParts(html, highlight.keyParts) : html} trusted={!!highlight} className={className} />`.

Single switch point — read-call-siteovi ne znaju za TipTap.

## 3. Call-site migracije (read-only)

Svaka tačka koristi isti pattern: pripremimo `contentDoc` iz zapisa i prebacimo `<SafeHtml html={x.content}>` u `<ContentRenderer doc={x.contentDoc} html={x.content} … />`.

Kartica/sections (`Section.contentDoc` već postoji nakon PR-3):
- `src/components/card-list/CardRow.tsx` (linije 129, 146) — `doc={s.contentDoc}` + `highlight={{ keyParts: card.keyParts }}` za fallback.
- `src/components/category/CardViewTable.tsx` (189).
- `src/components/subject-cards/PassiveReader.tsx` (329).
- `src/components/SourceSnippetDialog.tsx` (71) — keyParts highlight u fallback grani.
- `src/components/LinkToExistingCardModal.tsx` (88).
- `src/components/GlobalSearch.tsx` (275) — search snippet ostaje HTML highlight; doc grana renderuje sekciju bez search-highlight markera. Da ne izgubimo `<mark>` search highlight, **ovaj call-site ostaje na SafeHtml** (snippet je dinamički generisan, nije perzistovan kao EditorDoc).
- `src/features/mnemonic/workshop/WorkshopCardItem.tsx` (157).
- `src/components/card-form/EditorSection.tsx` (43) — paragraf preview u formi, ostaje SafeHtml (privremeni preview, nema contentDoc).
- `src/components/source-reader/smart-split/CuttingView.tsx` (51) — radi nad sirovim HTML chunk-om iz splittera, ostaje SafeHtml.

Source (`Source.contentDoc` postoji):
- `src/components/zettelkasten/SourceSidePanel.tsx` (60) → `doc={source.contentDoc} html={source.htmlContent}`.

KB Article (`KnowledgeBaseArticle.contentDoc` postoji):
- `src/components/zettelkasten/ZettelPreview.tsx` (194) → `doc={article.contentDoc} html={html}` (html ostaje renderovani markdown preview).

## 4. Prose stilovi → `.ProseMirror`

`src/index.css` (oko linija 658-720, 860-880):
- Svuda gdje stoji selektor `.prose`, dodati paralelni `.ProseMirror`:
  - `.prose, .ProseMirror { … }`
  - `.dark .prose, .dark .ProseMirror { … }`
  - `.prose [style*="color"], .ProseMirror [style*="color"] { … }` itd.
- `.card-prose` ostaje (klasa se primjenjuje preko `className` na `<EditorView>` wrapper-u — TipTap je dodaje na isti element gdje je i `.ProseMirror`).

Time čuvamo Styling Prose Fixes v3 invarijantu (puni `--foreground`, inline color override-i u oba moda).

## 5. Sanitizacija

- DOMPurify ostaje u `SafeHtml` (fallback grana) i u `htmlToDoc` (već postoji u PR-3).
- AST grana ne ide kroz `dangerouslySetInnerHTML` → nema render-time XSS surface-a; TipTap node-ovi su strukturisani.

## 6. Testovi

Fajl: `src/test/editor-view-readonly.test.tsx`
- Render `<EditorView>` sa fixture `EditorDoc` koji sadrži paragraf, heading, bold, wiki-link, mindmap-embed, key-part mark.
- Asercije: u DOM-u postoji `.ProseMirror`, `[data-wiki-link]`, `[data-mindmap-id]`, `mark.key-part-highlight`; `contenteditable="false"`.

Fajl: `src/test/content-renderer.test.tsx`
- `doc` postoji → renderuje `.ProseMirror`, **ne** poziva `sanitizeHtml`.
- `doc` nedostaje → renderuje `SafeHtml`, HTML prošao kroz DOMPurify (provjera preko spy-a na `sanitize` ili dovoljnog markup-a).
- `highlight.keyParts` se primjenjuje samo u fallback grani.

Smoke: postojeći vitest run mora ostati zelen.

## 7. Out of scope (PR-5)

- Pisanje preko TipTap-a u kartičnoj formi / source editor-u / zettel editor-u.
- Uklanjanje `htmlContent` / `content` polja (ostaju kao SSOT do PR-6).
- Read-path optimizacija (memoizacija EditorView instanci per-id), ako se pojavi perf problem.

## Tehničke napomene

- TipTap v3, `immediatelyRender: false` da izbjegnemo SSR/hydration mismatch warninge i da editor instanca živi tek nakon mount-a.
- `useEditor` dependency lista: `[doc]` — kad se referenca dokumenta promijeni, ponovo `setContent` umjesto pune re-inicijalizacije, da NodeView-i ne flicker-uju.
- `editor.setEditable(false)` redundantno (već smo prošli `editable: false`), ali eksplicitno postavljamo radi sigurnosti.
- `card-prose` i ostali utility class-ovi ostaju kompatibilni jer ih dodajemo na isti wrapper element koji TipTap renderuje sa `.ProseMirror`.
