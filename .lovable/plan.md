
# PR-7d: Audit Resolution — Priprema za OPFS SQLite + TanStack Query

Cilj: ukloniti tehnički dug iz PR-7a/b/c i ostaviti codebase u "single source of truth" stanju prije OPFS+TanStack migracije. Plan slijedi prioritete iz audit-a (P0 → P1 → P2). P3 i DIO D (OPFS/FK/test adapter) ostaju za zasebne PR-ove.

---

## Milestone 1 — P0: Crash prevencija prije v22 destrukcije

### M1.1 Završiti M3 derive-fallback (audit C1)
Zamijeniti preostale legacy text reads sa `deriveHtml(section.contentDoc)` / `derivePlainText`:
- `src/components/card-form/EditorSection.tsx:235` — `content={section.content}` → `deriveHtml(section.contentDoc)`.
- `src/components/learn/StudyModeRecall.tsx:154, 205` — drop `html={section.content}`, ostaviti `doc=...` only.
- `src/components/category/CardViewTable.tsx:189` — drop `html` prop.
- `src/components/SourceSnippetDialog.tsx:72` — drop `html` prop.
- `src/features/mnemonic/workshop/WorkshopCardItem.tsx:160` — drop `html`, dodati `doc={s.contentDoc}`.
- `src/lib/migrations/backup-schema.ts:256` — `htmlContent: deriveHtml(s.contentDoc)` (ili izbaciti polje + bumpovati backup verziju → koristiti opciju 1 zbog kompatibilnosti sa starim backup fajlovima).

### M1.2 Ukloniti deprecated polja iz tipova (audit C2)
Posle M1.1:
- `Section.content?: string` → ukloniti iz `src/lib/sr/types.ts`.
- `Source.htmlContent?` → ukloniti iz `src/lib/types`.
- `KnowledgeBaseArticle.content?` → ukloniti.

TS compiler kao alarm — popraviti svaki preostali read-site dok `bunx tsc --noEmit` ne prođe čisto. IDB row tipovi (migration shim u `migrate.ts`) ostaju netaknuti jer čitaju pre-v22 shape.

### M1.3 Demontirati dual-read scaffolding (audit C5)
Donesena odluka: **svi selectors idu kroz Dexie liveQuery** (`*FromDb`). Razlog: TanStack Query će kasnije wrap-ovati taj layer; RAM duplikat bi blokirao deterministički query key model.

- Obrisati `useDualReadDiff` (linije 152–174) i RAM varijante (`useCardsByCategoryRam` itd.) iz `src/store/useCardSelectors.ts`.
- Façade funkcije (`useCardsByCategory`, `useCardCountByCategory`, `useCardById`) → direktni re-export iz `useCardSelectorsFromDb.ts`.
- `cardMapStore` ostaje SAMO kao optimistic-update overlay za pending writes (koristi se u `cardRepository` write path-u). Nikad više kao primarni read.
- Ukloniti `USE_DB_LIVE_SELECTORS` flag iz `src/lib/feature-flags.ts`.

---

## Milestone 2 — P1: Perf regresije + write API unifikacija

### M2.1 AST-only `ContentRenderer` + pure `AstNodeRenderer` (audit C3)
- Ukloniti `html` prop iz `ContentRenderer` (svi konzumeri sada šalju `doc` nakon M1.1).
- Napisati `src/components/ui/AstNodeRenderer.tsx` — pure React walker kroz `EditorDoc.content`, emituje JSX (paragraf, heading, lista, bold/italic marks, wiki-link, keyPart highlight, mindmap embed placeholder). Bez TipTap instance.
- Prebaciti read-only call-sites na `AstNodeRenderer`:
  - `CardViewTable` (virtualizovan listing — najveći win)
  - `StudyModeRecall` reveal/read faza
  - `SourceSnippetDialog`
  - Smart-Split `CuttingView` blokovi (`src/components/source-reader/smart-split/CuttingView.tsx:51-54`)
  - `EditorSection` preview (`src/components/card-form/EditorSection.tsx:44`)
- `EditorView` (TipTap read-only) ostaje SAMO za bogate render kontekste gdje treba interaktivnost (Zettelkasten article body, npr.).

### M2.2 Eliminisati `RichTextEditorV4` shim (audit C4)
Migrirati 3 konzumera da drže `contentDoc` u local state-u:
- `src/components/source-reader/smart-split/ModuleCard.tsx`
- `src/components/source-reader/SmartSplitSummaryDialog.tsx`
- `src/features/mnemonic/workshop/WorkshopCardItem.tsx`

Promijeniti store/parent shape: `htmlContent: string` → `contentDoc: EditorDoc` u smart-split modules tipu i mnemonic workshop card item-u. Sve `onChange(html)` postaju `onChange(doc)`. Eksport pipeline (smart-split → final card) može pozvati `deriveHtml` na samom write boundary-u ako je to zaista potrebno.

Obrisati `src/components/editor-v4/RichTextEditorV4.tsx`.

### M2.3 Popraviti `EditorV4` placeholder churn (audit A5)
`src/components/editor-v4/EditorV4.tsx:177-182` — odvojiti placeholder od `extensions` memo-a tako da promjena `placeholder`-a ne re-instancira editor. Konkretno: koristiti TipTap `Placeholder.configure({placeholder: () => latestPlaceholderRef.current})` sa `useLatestRef`. Editor se i dalje uništava u cleanup-u, ali ne i na svaki placeholder change.

### M2.4 Standardizovati write API shape (audit C9)
Konvergirati sve write funkcije na `(input) => Promise<Result>` sa eksplicitnim error tipom:
- `cardRepository.put/bulkPut` → async, vraća `{ok: true} | {ok: false, error}`.
- `saveSource`, `saveArticle` — već async, samo ujednačiti return shape.
- `categoryRepository.commit` — već usklađen.

Cilj: TanStack `useMutation` može generičko wrapovati sve domene istom `onSuccess/onError` semantikom kasnije.

---

## Milestone 3 — P2: Čišćenje keš površine

### M3.1 Deduplicirati cards keševe (audit B1, C6)
- Ukloniti `_mapVersion`/`_cachedArray` iz `src/lib/persist-queue.ts:21-30`.
- Ukloniti `_cardsCacheMap`/`_cardsCacheArr` iz `src/contexts/cards/CardStateProvider.tsx:28-37`.
- Konsolidovati u jedan selector iznad `cardMapStore` (`useCardsArray()` u `useCardMapStore`).

### M3.2 PersistAdapter interface (audit C10)
Izvući IDB-specific write logiku iza interface-a, bez mijenjanja ponašanja:
- `src/lib/persistence/PersistAdapter.ts` — interface: `bulkApply(ops)`, `recoverPending()`.
- `src/lib/persistence/idb-outbox-adapter.ts` — trenutna implementacija (`outboxPut` → `put` → `outbox.bulkDelete`).
- `persist-queue.ts` zove adapter umjesto direktno Dexie.

OPFS SQLite adapter dolazi u zasebnom PR-u, ali interface je spreman.

---

## Milestone 4 — Verifikacija

- `bunx tsc --noEmit` — clean.
- `bunx vitest run` — svi testovi prolaze; adaptirati/obrisati testove koji su importovali RAM selectore ili `RichTextEditorV4`.
- Smoke pass: Review, Smart-Split, SourceReader, Zettelkasten preview, GlobalSearch, StudyMode, CardViewTable (virtualizovano scroll-anje).

---

## Eksplicitno IZVAN scope-a (zasebni PR-ovi)

- **P3**: C7 (zettelkasten keš), C8 (event-bus redukcija) — kozmetika, ne blokira.
- **DIO D**: OPFS SQLite migracija, FK CASCADE shema (D3), backlink table denormalizacija (D4), test adapter (D8), `outbox` brisanje (D5). Ovi pripadaju OPFS PR-u, ne ovom audit-resolution PR-u.
- Sigurnosna mreža: v22 destrukcija ostaje gated na `v4_telemetry_healthy === "true"` (već urađeno u PR-7c) — ovaj PR ne otvara taj gate niti mijenja preflight politiku.

---

## Procjena rizika

| Milestone | Rizik | Mitigacija |
|---|---|---|
| M1.1+M1.2 | TS može otkriti više read-site-ova nego što audit lista | Iterativno popraviti dok `tsc` ne prođe |
| M1.3 | RAM selector je default u DEV-u — uklanjanje mijenja read path za svakog developera | Smoke test svih primarnih view-ova prije merge-a |
| M2.1 | `AstNodeRenderer` mora pokrivati sve schema node tipove | Reuse fixture set iz `src/test/fixtures/editor-html/*` kao snapshot test |
| M2.2 | Smart-split/mnemonic store shape promjena = migration na postojećim draftovima | Lazy migration u storage layer-u: ako naiđe na `htmlContent` string, konvertuj `htmlToDoc` pri load-u |
| M2.4 | Promjena return shape-a `cardRepository.put` može razbiti pozive | Grep-and-replace; većina caller-a ne čita povratnu vrijednost |
