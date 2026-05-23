# V4 Editor Epic — HTML → AST (TipTap)

Cilj: zamijeniti trenutni `contentEditable` + `innerHTML` + DOMPurify pipeline jednim AST-baziranim editorom (TipTap / ProseMirror), tako da:
- XSS rizik se eliminiše po dizajnu (nema sirovog HTML-a u stanju),
- wiki-linkovi, `::mindmap[id]` embedi, key-parts highlight i Smart-Split postaju **tipizirani AST čvorovi**, a ne regex/sanitize zakrpe,
- otvara se put ka Notion-style `/` komandama i blok drag-and-drop-u.

## Izbor: TipTap (preko Lexical)
- ProseMirror jezgro je provjereno, dokumentovano, ima zrelu schemu i decorations API.
- TipTap = tanak React layer, lakša integracija sa našim postojećim DM Sans / prose stilovima.
- Lexical je elegantniji, ali ima manje gotovih nodeova za naše custom slučajeve (wiki-link, mindmap embed) i slabiju paste/sanitize priču.

## Trenutno stanje (mapirano)
Površine koje pišu/čitaju HTML:
- `src/components/RichTextEditor.tsx` (323 LOC) — primarni RTE, `contentEditable` + manualni `innerHTML` sync na blur.
- `src/components/source-reader/SourceContent.tsx` + `src/hooks/source-reader/useSourceEditing.ts` — source rich-text editor sa Smart Paste.
- `src/components/category/SourceEditor.tsx` (356 LOC) — source editor cijelog dokumenta.
- `src/components/zettelkasten/ZettelEditor.tsx` (214 LOC) — markdown-ish ali piše HTML; `::mindmap[id]` regex embedi.
- `src/components/ui/safe-html.tsx`, `src/lib/sanitize.ts`, `src/lib/highlight-key-parts.ts` — runtime DOMPurify + regex highlight.
- `src/components/card-form/EditorSection.tsx`, `src/hooks/card-actions/useSectionEditor.ts` — Essay sekcije.

Nije RTE (ne dirati u ovom epiku): `ZettelTagEditor`, `ZettelAliasEditor`, `HookEditor`, `TagsEditor` — tag inputi.

Polja u IDB koja drže HTML: card section `content`, source `bodyHtml`, zettel article `bodyHtml`. Svi se danas serijalizuju kao sanitizovan HTML string.

---

## Faze (svaka = jedan PR, svaka samostalna isporuka)

### PR-1 — Isolated playground (nema integracije)
- Dodati `tiptap` + minimalan set extensions (`StarterKit`, `Link`, `Placeholder`, `Underline`, `TextAlign`, `Highlight`).
- Novi route `/__lab/editor` (dev-only, iza `import.meta.env.DEV`) sa standalone `LabEditor.tsx`.
- Lokalni state, bez perzistencije. Cilj: tim vidi/testira UX bez ikakvog rizika za produkciju.
- Dodati `src/test/editor-v4-lab.test.tsx` (smoke: render + tipkanje + serialize round-trip).

### PR-2 — Domain JSON schema + codecs
- Definisati `EditorDoc` JSON tip (`src/lib/editor-v4/schema.ts`): `{ version: 4, content: ProseMirrorJSON }`.
- Custom node specs:
  - `wikiLink` (atrs: `targetId`, `display`) — zamjenjuje regex iz `zettelkasten-wiki-link.ts`,
  - `mindmapEmbed` (atrs: `mindmapId`) — zamjenjuje `::mindmap[id]` regex,
  - `keyPart` mark — zamjenjuje runtime highlight.
- Codecs:
  - `htmlToDoc(html: string): EditorDoc` — koristi ProseMirror DOMParser + naša pravila za wiki/mindmap detekciju,
  - `docToHtml(doc): string` — samo za read-only fallback i export (PDF/print),
  - `docToPlainText(doc): string` — za search/preview.
- Unit testovi u `src/test/editor-v4-codec.test.ts`: round-trip 20 reprezentativnih HTML fixture-a (`src/test/fixtures/editor-html/*.html`) iz prave baze (sanitizovani export). Niti jedan link/mindmap embed ne smije nestati.

### PR-3 — Migration engine na dummy-ju
- `src/lib/editor-v4/migrate.ts`: čita IDB record, ako `content` nije `EditorDoc` JSON → konvertuje preko `htmlToDoc`, upisuje **u zaseban `contentDoc` kolonu** (Dexie v22 bump, aditivna migracija, ne diramo `content`).
- Migracija je **lazy + idempotentna**: pri load-u card/source/article-a koji još nema `contentDoc`, generišemo ga i perzistujemo kroz outbox.
- Dry-run CLI script `src/scripts/migrate-editor-v4.ts` koji se pušta protiv ZIP backup-a iz `Data Backup v5` formata; output: izvještaj `{ migrated, failed, samplesWithDataLoss }`.
- Test: `src/test/editor-v4-migrate.test.ts` na fixture backup-u; 0 data loss tolerancija za linkove/embede.

### PR-4 — Read path: render preko AST-a
- Novi `<EditorView doc={...} readOnly />` komponenta (TipTap u `editable={false}` modu).
- Svuda gdje danas radimo `<SafeHtml html={...}>` u read-only kontekstu (card preview, review session, zettel render) — ako `contentDoc` postoji, renderuj preko AST-a; inače fallback na trenutni `SafeHtml` (kompatibilnost dok migracija ne pokrije sve).
- DOMPurify ostaje samo na fallback grani.
- Vizuelni regression: prose stilovi (`Styling Prose Fixes v3`) primijenjeni na `.ProseMirror` selektor da boja/font ostanu identični.

### PR-5 — Write path #1: card sections
- Zamijeniti `RichTextEditor` u `card-form/EditorSection.tsx` sa novim `<EditorV4 />`.
- `useSectionEditor` piše `contentDoc` (JSON) u IDB; `content` (HTML) se generiše iz `docToHtml` samo dok stari kod čita (deprecation period).
- Wiki-link autosuggest, key-parts toggle, undo/redo — sve preko TipTap komandi.
- Postojeći testovi za card editing moraju proći; dodati `src/test/editor-v4-cards.test.tsx`.

### PR-6 — Write path #2: sources + zettel
- Smart Paste (`useSourceEditing`) → TipTap paste rules (regex → node transforms umjesto innerHTML manipulacije).
- `SourceEditor.tsx` i `ZettelEditor.tsx` portovani na `<EditorV4 />`.
- `::mindmap[id]` postaje `mindmapEmbed` nodeView koji renderuje postojeću mindmap snapshot komponentu.
- Smart-Split wizard nastavlja da radi nad **plain text** kao i sad (`Smart-Split Wizard` pravilo) — wizard čita `docToPlainText`, generiše nove sekcije kao `EditorDoc`.

### PR-7 — Cleanup + telemetrija
- Ako telemetrija pokaže >99.5% recorda sa `contentDoc`, ukloniti HTML kolonu (Dexie v23 destruktivna migracija + backup snapshot prije).
- Obrisati `RichTextEditor.tsx`, `SafeHtml`, `highlight-key-parts.ts` runtime regex, sav `dangerouslySetInnerHTML` u `src/components/**`.
- DOMPurify ostaje samo u import/export putanji (sanitacija dolaznog HTML-a iz backup-a/clipboarda) — više nigdje u runtime render-u.
- Memorije za update: `Rich Text Implementation`, `Global Sanitization v6`, `Styling Prose Fixes v3`.

---

## Acceptance kriterijumi (kraj epika)
- `grep -r "dangerouslySetInnerHTML" src/components` → 0 hitova.
- `grep -r "innerHTML\s*=" src` → 0 hitova izvan codec-a i testova.
- 0 data loss u migracionom izvještaju protiv produkcijskog backup-a.
- Wiki-linkovi i mindmap embedi rade bez ijednog regex-a u render putanji.
- Bundle delta: TipTap StarterKit ≈ +60KB gz; izbrisani RichTextEditor + DOMPurify runtime ≈ −35KB → neto ~+25KB.

## Rizici i mitigacije
- **Stilovi se razlikuju** → izolovan `LabEditor` u PR-1 + Storybook snapshoti prose stilova prije PR-4.
- **Migracija pokvari custom HTML** → lazy + idempotent, originalni HTML ostaje u `content` koloni do PR-7; mogućnost rollback-a uvijek.
- **TipTap dep težina** → koristimo samo `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit` + selektivni extensions; ne instaliramo `@tiptap/pm` duplikat.
- **Electron CSP** → TipTap ne koristi `eval`/inline skripte; trenutna CSP (`Electron Infrastructure v4`) ostaje važeća, samo provjeriti u PR-1.

## Tehnički detalji (za inženjere)
- Dexie schema bump (PR-3): aditivni indeks `contentDoc` na `cards`, `sources`, `zettelArticles`. Bez index-a, samo polje.
- Codec ulazna tačka: `ProseMirror.DOMParser.fromSchema(schema).parse(domNode)` sa pre-procesorom koji prepoznaje `<a data-wikilink>` i `<span data-mindmap>` pattern-e (mi smo ih već emitovali u sanitize fazi).
- NodeView za `mindmapEmbed` mora biti `stopEvent: () => true` da TipTap selection ne otima klikove unutar mindmap canvas-a.
- `key-part` mark mora biti `inclusive: false` da se ne širi pri tipkanju.
- Outbox iz `Ref Delta Persistence v4` ostaje SSOT za perzistenciju; samo payload se mijenja sa `string` na `EditorDoc` JSON.
- Testing: koristiti `@tiptap/core`'s `prosemirror-test-builder` za AST asercije; jsdom dovoljan, ne treba browser.

## Šta epik **ne** radi
- Ne migriramo notes/comment polja (već su plain text).
- Ne diramo tag/alias/hook editore.
- Ne uvodimo collaborative editing (Y.js) — to je zaseban epik nakon V4.
- Ne mijenjamo `Smart-Split Wizard` UX (ostaje plain-text input).
