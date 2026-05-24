## PR-2 — Domain JSON schema + codecs

Cilj: definisati tipizirani `EditorDoc` AST i bidirekcione codece (HTML ↔ Doc ↔ plain text), uz fixture round-trip testove. Bez ikakve integracije u produkcijske view-ove — sve ostaje izolovano u `src/lib/editor-v4/*`.

### Nove datoteke

```text
src/lib/editor-v4/
  schema.ts          # TipTap schema + custom nodes/marks (wikiLink, mindmapEmbed, keyPart)
  types.ts           # EditorDoc, EditorNodeJSON tipovi
  extensions/
    wiki-link.ts     # TipTap Node extension (atrs: target, display, hasPipe)
    mindmap-embed.ts # TipTap Node extension (atrs: mindmapId)
    key-part.ts      # TipTap Mark extension (inclusive: false)
  codecs/
    html-to-doc.ts   # DOMParser + pre-processor za [[wiki]] i ::mindmap[id]
    doc-to-html.ts   # za read-only fallback i export
    doc-to-text.ts   # za search/preview
  index.ts           # barrel

src/test/fixtures/editor-html/
  01-plain-paragraph.html
  02-headings.html
  03-lists-nested.html
  04-bold-italic-underline.html
  05-blockquote-code.html
  06-link-external.html
  07-wiki-link-simple.html        # [[Naslov]]
  08-wiki-link-piped.html         # [[Naslov|prikaz]]
  09-mindmap-embed.html           # ::mindmap[uuid]
  10-key-part-mark.html           # <mark class="key-part-highlight">
  11-mixed-wiki-and-marks.html
  12-table-simple.html
  13-image.html
  14-hr-rule.html
  15-nested-marks.html
  16-empty-paragraphs.html
  17-malformed-cleanup.html
  18-multiple-wiki-same-paragraph.html
  19-mindmap-inside-list.html
  20-real-card-section.html       # pravi sanitizovani export iz baze

src/test/editor-v4-codec.test.ts  # round-trip nad svim fixture-ima
src/test/editor-v4-schema.test.ts # schema validacija + node atrs
```

### Schema (ključne odluke)

`EditorDoc`:
```ts
interface EditorDoc {
  version: 4;
  content: ProseMirrorJSON; // root doc node
}
```

Custom čvorovi:
- `wikiLink` — inline node, atomic. Atrs: `target: string`, `display: string`, `hasPipe: boolean`. Serijalizacija: `<a data-wikilink="target" data-display="display">display</a>` (kompatibilno sa postojećim `sanitize.ts` ALLOWED_ATTR-ima nakon dodavanja `data-wikilink`/`data-display` u allowlist — TO SE NE RADI U PR-2, samo u PR-4 kad uđe read path).
- `mindmapEmbed` — block node, atomic. Atrs: `mindmapId: string`. Serijalizacija: `<div data-mindmap="id"></div>`.
- `keyPart` — mark, `inclusive: false`. Serijalizacija: `<mark class="key-part-highlight">`.

Reuse: `WIKI_LINK_RE` iz `src/lib/zettelkasten-wiki-link.ts` (već je SSOT). `::mindmap[id]` pattern centralizovati u `src/lib/editor-v4/patterns.ts`.

### Codec ugovor

```ts
htmlToDoc(html: string): EditorDoc
docToHtml(doc: EditorDoc): string        // za fallback render; ide kroz sanitizeHtml na pozivnoj strani
docToPlainText(doc: EditorDoc): string   // čist tekst, jedan space između block-ova
```

Pre-procesor u `htmlToDoc`:
1. DOMPurify nad ulazom (defense-in-depth — ulaz može biti backup ili clipboard).
2. Tekstualni pass: `[[...]]` → `<a data-wikilink="target" data-display="display">display</a>`, `::mindmap[id]` → `<div data-mindmap="id"></div>`.
3. Postojeći `<mark class="key-part-highlight">` se prepoznaje direktno iz schema-e.
4. ProseMirror `DOMParser.fromSchema(schema).parse(domFragment)` → JSON.

`docToHtml` koristi ProseMirror `DOMSerializer` sa istim toDOM specifikacijama iz schema-e.

`docToPlainText` rekurzivno spaja `text` nodeove + `\n\n` između block-ova; za `wikiLink` izbacuje `display`, za `mindmapEmbed` izbacuje prazno (ili `[mindmap]` placeholder — odluka u testu).

### Test plan

`src/test/editor-v4-codec.test.ts` — za svaki od 20 fixture-a:
- `htmlToDoc(html)` ne baca, vraća validan `EditorDoc`.
- `docToHtml(doc)` round-trip — drugi prolaz `htmlToDoc(docToHtml(doc))` daje strukturno jednak doc (preko `struct-eq.ts`).
- Sve `[[wiki]]` instance opstaju kao `wikiLink` čvorovi (count + target equality).
- Sve `::mindmap[id]` instance opstaju kao `mindmapEmbed` čvorovi.
- Svi `<mark class="key-part-highlight">` opstaju kao `keyPart` markovi.

`src/test/editor-v4-schema.test.ts`:
- Schema validira atrs (target prazan → throw).
- `keyPart` mark `inclusive: false` ponašanje (programatski insertText ne širi mark).

Ciljano coverage gate: 0 data loss nad fixture-ima, schema parser ne baca ni na jednom.

### Dependencies

Ništa novo. PR-1 je već instalirao `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`. `prosemirror-model`, `prosemirror-state`, `prosemirror-transform` dolaze tranzitivno kroz TipTap. Za parser koristimo `@tiptap/core`'s re-export `DOMParser`/`DOMSerializer` (preko `editor.schema`).

### Šta PR-2 NE radi

- Ne dira `RichTextEditor.tsx`, `SafeHtml`, `sanitize.ts` allowlist.
- Ne dira IDB schema (to je PR-3).
- Ne uvodi nikakav UI — codec je čista lib funkcija.
- Ne mijenja `LabEditor` (može opciono dobiti dugme "AST JSON" koji već postoji).

### Acceptance

- `bunx vitest run src/test/editor-v4-codec.test.ts` → 20/20 round-trip prolazi.
- `bunx vitest run src/test/editor-v4-schema.test.ts` → prolazi.
- `grep -r "editor-v4" src/components src/views` → 0 hitova (izolacija očuvana).
- Bundle ne raste (codec se ne importuje iz produkcijskog koda).

### Rizici

- **ProseMirror `DOMParser` ne razumije naše custom data-atribute** → riješeno `parseDOM` pravilima u node spec-ovima (`getAttrs: dom => ({ target: dom.getAttribute("data-wikilink") })`).
- **Wiki-link pre-procesor lomi tekst unutar `<code>` blokova** → eksplicitno preskočiti tekstualni pass unutar `<code>`/`<pre>` (test fixture #5 to pokriva).
- **Round-trip "gubi" prazne paragrafe** → ProseMirror normalizuje; fixture #16 verifikuje očekivano ponašanje (paragraf bez sadržaja se čuva ako ima break, inače pada — dokumentovati).
