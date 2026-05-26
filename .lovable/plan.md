
# PR-7b — Grand Cleanup & DB Flip

Cilj: ukloniti dual-write tax na keystroke loop-u, fizički izbrisati `content` / `htmlContent` / `content (md)` iz IndexedDB i tipova, te otkačiti legacy renderer/regex highlight pipeline. `contentDoc: EditorDoc` postaje jedini canonical payload.

Odgovori usvojeni u clarifikaciji:
- **Read-sites**: hybrid — hot scanneri (backlink-index, wiki-link auto-create, auto-link-suggestion, source-coverage) prelaze direktno na `contentDoc`; ostatak (snippet preview, export, mnemonic hint, search, validation) ide preko derived-field shim-a.
- **Backup policy**: forced backup je obavezan u Electronu; u web/preview okruženju (gdje nema `window.electronAPI`) v22 upgrade se **preskače** — telemetrija označava `v4_skip_reason: "no_electron"`, baza ostaje na v21.
- **Test fixtures**: novi `src/test/factories.ts` sa `makeCard({ html })` / `makeSource({ html })` / `makeArticle({ md|html })` koji interno seed-aju `contentDoc` preko `htmlToDoc`.

---

## Milestone 1 — Pre-flight Telemetry & Forced Backup

**Novi fajl: `src/lib/editor-v4/preflight-telemetry.ts`**
- Eksportuje `runV4Preflight(): Promise<{ healthy: boolean; reason?: string }>`.
- Korake:
  1. Provjeri da li smo u Electronu (`!!window.electronAPI?.backupStreamStart`). Ako ne — vrati `{ healthy: false, reason: "no_electron" }` i `localStorage.setItem("v4_skip_reason","no_electron")`.
  2. `db.cards.toArray()`, `db.sources.toArray()`, `db.knowledgeBaseArticles.toArray()` (paralelno).
  3. Za svaki rekord provjeri:
     - card: svaka `section.contentDoc?.version === 4 && section.contentDoc.content`
     - source: `source.contentDoc?.version === 4`
     - article: `article.contentDoc?.version === 4`
  4. Ako `migratedRatio < 1.0`: vrati `{ healthy: false, reason: "lazy_migration_incomplete", ratio }`; ne ruši — log warn, lazy-migrate nastavlja u pozadini.
  5. Ako 100%: pozovi `streamBackup(tableSpec, onProgress)` iz `src/lib/backup/export-stream.ts` + `electron-integration.ts` (`backupStreamStart/Chunk/Finish`). Putanja: defaultni Electron download folder, fajl `memoria-preflight-v22-<ts>.json`.
  6. Ako backup uspije: `localStorage.setItem("v4_telemetry_healthy","true")` + `v4_backup_path`. Inače: izbriši flag, `reason: "backup_failed"`.
- Pozvati iz boot orchestratora **prije** `db.open()`-a? Ne — Dexie verzioniranje ne možemo gate-ovati nakon `open()`. Umjesto toga: `runV4Preflight()` se zove **na prvom boot-u sa v4 flag-om**, prije nego što schema v22 bude registrovana. Strategija: v22 upgrade block se izvršava samo ako je `localStorage.v4_telemetry_healthy === "true"`. Ako nije, app i dalje otvara DB na v22 ali upgrade hook detektuje skip-flag i ostavlja legacy polja na miru (idempotentno). Sljedeći boot ponavlja preflight.

**Boot wiring**: pozvati u `src/lib/boot/*` (ili gdje `db.open()` živi), prije otvaranja konekcije. Telemetrija mora završiti sinhrono u odnosu na boot — `await` sa 5s timeout-om; timeout = skip.

---

## Milestone 2 — Dexie v22 Destructive Upgrade

**`src/lib/db-schema.ts`**
- Dodati nakon `version(21)`:
  ```ts
  this.version(22).stores({}).upgrade(async (tx) => {
    if (localStorage.getItem("v4_telemetry_healthy") !== "true") {
      logger.warn("[db v22] preflight not healthy — skipping destructive cleanup");
      return;
    }
    await tx.table("cards").toCollection().modify(card => {
      for (const s of card.sections ?? []) delete s.content;
    });
    await tx.table("sources").toCollection().modify(src => {
      delete src.htmlContent;
    });
    await tx.table("knowledgeBaseArticles").toCollection().modify(a => {
      delete a.content;
    });
  });
  ```
- Komentar u stilu postojećih (`v22 — destructive cleanup …`).

**Tipovi (`src/lib/sr/types.ts`)**
- `Section`: izbrisati `content: string`; `contentDoc: EditorDoc` (REQUIRED, bez `?`).
- `db-schema.ts` interfejsi (`Source`, `KnowledgeBaseArticle`): izbrisati `htmlContent` / `content`, `contentDoc: EditorDoc` REQUIRED.
- `src/lib/editor-v4/migrate.ts` zadržava legacy konverter funkcije (`htmlToDoc`, `mdToHtml`, itd.) — koriste se u test factory-jima i u import pipeline-u.

**Backup/restore**
- `src/lib/migrations/backup-schema.ts` i restore pipeline (`backup-restore-hardening`): dodati v22 step koji droppa legacy stringove ako naiđe na stari backup. Ako nedostaje `contentDoc` u importu — sintetizovati ga iz HTML/MD na licu mjesta.

---

## Milestone 3 — Keystroke Write-Path

**`src/hooks/card-actions/useSectionEditor.ts`**
- `updateSectionDoc`: izbaciti `content: docToHtml(doc)`; čuvati samo `contentDoc`.
- `handleCut`: parsovati paragrafe iz **AST** umjesto iz HTML stringa (`contentDoc.content`-ovi `paragraph` node-ovi). Helper `splitDocAtParagraph(doc, idx): [EditorDoc, EditorDoc, title]` u `src/lib/editor-v4/split-doc.ts`. Bez `docToHtml` re-konverzije.
- `SectionInput` type (`validation.ts`): `content` polje postaje opcionalno legacy field samo za import / postaje uklonjeno; `contentDoc` required.

**`src/hooks/zettelkasten/useArticleDraft.ts`**
- `Draft.content` ukloniti. `updateDraftDoc`: samo `setDraft(prev => ({ ...prev, contentDoc: doc }))`.
- `flush()`: dirty-check sad poredi `contentDoc` referencu (deep-equal preko `JSON.stringify` ako mora; bolje: pratiti `lastSavedDocRef` koji updateDraftDoc bumpa).
- Snimanje: `saveArticle({ ..., contentDoc })`. Markdown se NE derivira pri save-u (vidi M3 read-sites).

**`src/components/category/SourceEditor.tsx`**
- Ukloniti svaki `docToHtml`/`sanitizeHtml(docToHtml(...))` poziv u `onChange`. Source save-on-blur čuva samo `contentDoc`.

**Validacije**
- `src/hooks/card-actions/validation.ts`: `stripHtmlText(s.content)` → `docToPlainText(s.contentDoc)`. Helper već postoji u `editor-v4`; ako ne — dodati `src/lib/editor-v4/doc-to-text.ts` (rekurzivni walk).
- Empty check: `isDocEmpty(doc): boolean` u istom fajlu.

**Hot scanneri (hybrid odluka)**
- `src/lib/backlink-index.ts`: `iterateWikiLinks` mora da prima `EditorDoc` i da hoda po `wikiLink` mark-ovima + text node-ovima umjesto markdown stringa. Novi `iterateWikiLinksFromDoc(doc)`.
- `src/lib/auto-link-suggestion.ts`: `stripHtml(section.content)` → `docToPlainText(section.contentDoc)`.
- `src/lib/source-coverage.ts`: čita `article.contentHtml` — provjeriti da li je to alias; ako jeste — preusmjeriti na `docToPlainText(article.contentDoc)`.
- `useWikiLinkAutoCreate` (ako postoji) — input postaje `contentDoc`.

**Shim za read-sites koji nisu hot**
- Novi `src/lib/editor-v4/derived.ts`:
  ```ts
  export function deriveHtml(doc: EditorDoc): string { /* memoized via WeakMap<EditorDoc,string> */ }
  export function deriveMarkdown(doc: EditorDoc): string { /* memo */ }
  export function derivePlainText(doc: EditorDoc): string { /* memo */ }
  ```
  WeakMap cache → po jedna konverzija po doc referenci za cijeli runtime; doc reference se mijenja samo na pravi save.
- Konzumeri koji su do sada čitali string:
  - `useCardExport`, `useCardDraftAutosave`, `useCardViewFilters`, `useCardCRUD`
  - `GlobalSearch`, `Ctrl+K`, `SourceSnippetDialog`, `MainLayout` (preview snippets)
  - `ReviewCard`, `CardRow`, `StudyModeRecall` (već koriste `ContentRenderer` — vidi M4)
  - `speed-reader-constants`, `FrequentErrors`, `CardCreateMenu`, `CardViewTable`
  - `MnemonicWorkshop`, `WorkshopCardItem`, `mnemonic-storage`
  - `useAutoSplitImport`, `useCardCRUD`, `useSourceReaderActions`, `sourceEditingService`
  - `SourceSidePanel` (zettelkasten)
- Pravilo: `record.content` → `derivePlainText(record.contentDoc)` ili `deriveHtml(record.contentDoc)` u zavisnosti od konteksta. Bez sinhrone konverzije na keystroke — derivacija se dešava na read access.

---

## Milestone 4 — Renderer Purge

**`src/components/ui/ContentRenderer.tsx`** — gut do:
```tsx
import { EditorView } from "@/lib/editor-v4/EditorView";
import type { EditorDoc } from "@/lib/editor-v4";
interface Props { doc: EditorDoc; className?: string; }
export function ContentRenderer({ doc, className }: Props) {
  return <EditorView doc={doc} className={className} />;
}
```
- Svi pozivaoci: ukloniti `html=` i `highlight=` props-e (TipTap nodes sa `keyPart` mark-om već renderaju `<mark>`).

**Brisanja**
- `src/components/RichTextEditor.tsx` — DELETE (M2 PR-3 ga je već zamijenio sa `EditorV4`).
- `src/components/ui/safe-html.tsx` — DELETE. Preostala 3 referenta (`EditorView.tsx`, `EditorV4.tsx`, `smart-paste.ts`) koriste `dangerouslySetInnerHTML` **interno za TipTap**, ne kroz `SafeHtml` — to ostaje (smart-paste već prolazi kroz DOMPurify na boundary-ju).
- `src/lib/highlight-key-parts.ts` — DELETE (regex matcher + `HighlightedSection` + `useKeyPartsMatcher`). Sve key-part highlighting sada radi `keyPart` mark u TipTap renderer-u.

**DOMPurify audit**
- `rg dangerouslySetInnerHTML src/components/` ostavlja samo: `EditorView.tsx` (TipTap render — trusted output) i `EditorV4.tsx` (isto). `smart-paste.ts` koristi DOMPurify na paste boundary — OK po memo `Global Sanitization v6`.
- Dokumentovati u kratkom komentaru u svakom od preostalih fajlova: "Trusted: doc is TipTap-rendered; sanitization happens at import/paste boundary."

---

## Milestone 5 — Verifikacija

1. **Test factories**
   - Novi `src/test/factories.ts`:
     ```ts
     export function makeCard(overrides?: Partial<Card> & { sectionsHtml?: string[] }): Card
     export function makeSource(overrides?: Partial<Source> & { html?: string }): Source
     export function makeArticle(overrides?: Partial<KnowledgeBaseArticle> & { md?: string; html?: string }): KnowledgeBaseArticle
     ```
     Interno: `htmlToDoc(html)` / `htmlToDoc(mdToHtml(md))` da popune `contentDoc`. Ne emituju `content` / `htmlContent` polja.
   - Refaktorisati testove koji konstruišu literal-e:
     - `selection-split.test.ts`, `selection-split-manual.test.ts`, `split-wizard-build.test.ts`
     - `source-reader-build-essay.test.ts`, `source-reader-in-place.test.ts`
     - `editor-v4-zettel-pr6.test.ts`, `editor-v4-cards.test.ts` (ako postoje)
     - `card-bubble-menu.test.tsx`, `mnemonic-*` testovi
   - Snapshot-ovi koji su asertirali HTML stringove → asertiraju AST node liste.

2. **Komande**
   - `bunx tsc --noEmit` — zero `.content` / `.htmlContent` referenci na `Section|Source|KnowledgeBaseArticle`. Type errori vode na preostale read-sites koje treba ili rewrite-ovati ili provući kroz `deriveX`.
   - `bunx vitest run` — sve passes.
   - `eslint .` — zero errors.
   - Manuelno: dev boot u Electronu sa pre-populiranom v21 bazom → backup fajl postoji → v22 upgrade prošao → `db.cards` rekordi nemaju `content` polje → kucanje u CardEditor-u ne pokreće `docToHtml` (verifikovati kratkim `console.time` u dev-only patch-u koji se odmah ukida).

3. **Memory updates**
   - Novi `mem://architecture/editor-v4-canonical` — "PR-7b: contentDoc je SSOT; legacy text columns ne postoje u runtime tipovima; derive helpers su WeakMap-cached."
   - Update `mem://architecture/storage-and-persistence-v6` — bumpati na v22, dodati notu o destructive cleanup-u uz preflight gate.
   - Update `mem://core` (Storage & Data linija): "Dexie v22; contentDoc REQUIRED na cards/sources/articles."

---

## Tehničke napomene

- **Atomicity**: v22 `modify()` per-table je u jednoj Dexie tx — Dexie garantuje atomicity po tabeli. Ne pokušavati multi-table tx jer Dexie upgrade hook to već radi na nivou cijelog upgrade callback-a.
- **WeakMap derive cache**: ključ je `EditorDoc` objekat. Pošto write-path uvijek alocira **novi** doc objekat (immutable iz TipTap-a), cache invalidation je automatski.
- **Backup file format**: koristiti postojeći `streamBackup(tableSpec)` izlaz; ne uvoditi novi format. Tako postojeći Restore radi unazad.
- **Fallback put za web preview**: u browser preview-u (gdje nema Electron-a) baza ostaje na v21 *legacy stringova*. Ovo je prihvatljivo jer je app desktop-only po memo `mem://platform/desktop-only`.

## ASCII flow

```text
boot
 │
 ├─► runV4Preflight()
 │     ├─ no electron?  → skip, set v4_skip_reason
 │     ├─ ratio<100%?   → skip, lazy-migrate continues
 │     └─ 100% + backup OK → set v4_telemetry_healthy=true
 │
 ├─► db.open()  (registers v22)
 │     └─ v22 upgrade hook
 │          ├─ healthy flag? → delete legacy columns
 │          └─ no flag?      → no-op (retry next boot)
 │
 └─► app renders with EditorView only (no SafeHtml/highlightKeyParts)
```

