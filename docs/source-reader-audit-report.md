# Source Reader & SQLite Audit Report

Audit executed per plan (stavke 1–10). Status: **OK** = verified healthy; **gap** = issue found; **fixed** = remediated in this sprint.

## Summary table

| # | Stavka | Status | Prioritet | Effort | Impact |
|---|--------|--------|-----------|--------|--------|
| 1 | `useSourceMapping.ts` | fixed | P1 | S | Srednji |
| 2 | `useSourceReaderShortcuts.ts` | fixed | P1 | S | Srednji |
| 3 | Presentational komponente | OK | P2 | — | Nizak |
| 4 | Source Reader testovi | OK | P1 | M | Srednji |
| 5 | `useSourceReaderActions` over-fetch | fixed | P0 | M | Visok |
| 6 | Legacy store (`selection`, `headingMenu`) | fixed | P0 | S | Srednji |
| 7 | `splitMode` / `splitStepIndex` | fixed | P2 | S | Nizak |
| 8 | Parent mount chain | OK (gap dokumentiran) | P2 | S | Srednji |
| 9a | `useCategoryDueCounts` SQL | fixed | P1 | M | Srednji |
| 9b | `useCategoryStatsData` | fixed | P3 | M | Srednji |
| 9c | Index migration smoke | fixed | P3 | M | Nizak |
| 9d | Essay wizard | gap | P1 | L | Visok |
| 10a | Worker queue vs `withLock` | OK | — | S | Dokumentacija |
| 10b | `withLock` unit testovi | fixed | P2 | S | Srednji |
| 10c | Shutdown race | OK (dokumentiran) | P2 | S | Nizak |

---

## 1. useSourceMapping.ts — fixed

**Provjera:** `getState()` u callbackima (nema Zustand pretplate). `commitMapping` stabilizovan. `splitMode === "separate"` uklonjen (nema UI togglea). Essay payload i dalje koristi generički `splitSelection`.

**Izmjene:**
- `commitMapping` → `useCallback`
- Uklonjena mrtva grana `buildSeparateEssaysFromModules` / `setSplitMode("combined")`
- Handleri vraćeni kroz `useMemo` sa stabilnim deps

**Preostalo (P1, odvojeni PR):** Essay wizard — `prepare-wizard-modules.ts`, plain-text `TitleEditor`, auto `sourceType` u `build-essay-payload.ts`.

---

## 2. useSourceReaderShortcuts.ts — fixed

**Nalaz:** `isContentEditable` guard blokirao **S** i **M** u read-only ProseMirror.

**Izmjena:** Guard sada blokira samo kad je `editMode === true` i fokus u contentEditable. U read modu S/M rade iz editora.

**Testovi:** Prošireni u `useSourceReaderShortcuts.test.tsx` (edit vs read ProseMirror, M toggle).

---

## 3. Presentational komponente — OK

`SourceContent`, `SourceBubbleMenu`, `SourceNavigation`, `SourceHeader`, `SourceDiffPreview`, `smart-split/*` — **nula** `useSourceReaderStore` importa (osim shell dijaloga/toolbara koji koriste `useShallow`).

- `SourceContent`: lokalni `draftJson` — parent se ne re-renderuje na tipkanje (OK).
- `SourceNavigation`: `memo` + stabilan `scrollToHeading` callback.
- `ModuleCard` / `TitleEditor`: HTML naslovi — povezano s essay wizard gapom (stavka 9d).

**P2 preporuka (nije implementirano):** `draftJson` → ref ako se koristi samo za mirror.

---

## 4. Testovi — OK

Postojeći test matrix u `src/test/`:
- `source-reader-shell.test.tsx` — shell mount, exam persistence
- `useSourceReaderShortcuts.test.tsx` — guard logika
- `smart-split-summary-dialog.test.tsx` — dialog open/close

Mock u shell testu ažuriran (`derived.sourceCards` umjesto `derived.cards`).

---

## 5. useSourceReaderActions — fixed (P0)

**Nalaz:** `useCardsByCategory` dekodirao cijeli predmet pri mountu; link modal primao puni niz.

**Izmjena:** Samo `useCardsBySource(source.id)`; `SourceReaderLazyModals` prima `derived.sourceCards`.

**P2 preporuka (nije implementirano):** Conditional query `enabled: linkModalOpen` za dodatnu uštedu kad modal nikad nije otvoren.

---

## 6. Legacy store polja — fixed (P0)

Uklonjeno iz `useSourceReaderStore.ts`:
- `selection`, `headingMenu`, `setSelection`, `setHeadingMenu`
- Tipovi `SelectionState`, `HeadingMenuState`

Aktivni kod koristi TipTap `getSelectionPayload` / `SourceBubbleMenu`.

---

## 7. splitMode / splitStepIndex — fixed (P2)

**Nalaz:** Wizard UI nema mode switch; `splitStepIndex` nekorišten.

**Izmjena:** Uklonjeno `splitMode`, `splitStepIndex`, setteri iz store-a i `initSplitWizard`.

`AutoSplitDialog` koristi zaseban `useAutoSplitImport` — ne dijeli store polje.

---

## 8. Parent mount chain — OK (gap dokumentiran)

**Mount chain:**
```
App.tsx → CategoryViewWrapper → CategoryView.tsx → SourceReader
```

**Parent pretplate (`CategoryView`):**
- `useCategoryData()` — category records
- `useCardsByCategoryWithStatus(categoryId)` — lista kartica + mastery (odvojeno od reader actions)
- `useCategorySourcesWithStatus(categoryId)` — sources

**Cross-route open:** `consumePendingSourceOpen` + `SOURCE_READER_OPEN_EVENT` (GlobalSearch / Zettelkasten side panel).

**Gap:** Parent drži pun `useCardsByCategoryWithStatus` iako reader više ne vuče category scope — prihvatljivo za mastery distribuciju u list viewu, ali skupo za velike predmete.

**P2 preporuka:** `React.memo(SourceReader)` — ✅ implementirano u `SourceReader.tsx` + stabilni callbacki u `CategoryView.tsx`.

---

## 9. card_sections_index read-path

### 9a. useCategoryDueCounts — fixed (P1)

**Potrošač:** `AppSidebar.tsx`

**Prije:** O(N) `countDueCards` nad `cardsByCategory` decode.

**Poslije:** `countDueCardsByCategoryFromDb(categoryId)` — SQL JOIN na `card_sections_index` + `cards.categoryId`.

### 9b. useCategoryStatsData — fixed (P3)

**Potrošači:** `DashboardPage.tsx`, `StatsPage.tsx`

Sva tri polja (`score`, `total`, `due`) sada iz SQL — **bez `useAllCards()`**. Denormalizacija: `cards.mastery_score` + migracija v8.

### 9c. Migration smoke — fixed (P3)

Dodan test u `card-sections-index.test.ts`: seed bez indeksa → `migrateCardSectionsIndex` → SQL due count.

Napomena: harness executor, ne pravi Worker roundtrip (jsdom ograničenje).

### 9d. Essay wizard — fixed (P1)

**Izmjene:**
- `prepare-wizard-modules.ts` — `normalizeQuestionTitle`, `sourceKindToCardSourceType`
- `ModuleCard` — plain-text `<input>` za naslov modula (bez `<p>` artefakata)
- `build-essay-payload.ts` — normalizacija naslova, auto `sourceType`, član-split samo za `propis`
- `useCardCRUD.addCard` — podržava `sourceType` u `extra`

---

## 10. SQLite worker mutex

### 10a. opfs-worker queue — OK

Worker ima `queue` + `pump()` + `currentTxId` serijalizaciju. Renderer `withSerialLock` (bivši inline `withLock`) = dvostruka serijalizacija, defense in depth.

Dokumentirano u komentarima: `opfs-worker.ts`, `worker-client.ts`.

### 10b. withLock testovi — fixed (P2)

`withLock` ekstrahovan u `serial-lock.ts`. Unit testovi: `src/test/serial-lock.test.ts` (redoslijed, no overlap, throw release).

### 10c. Shutdown race — fixed (P2)

`beforeunload` / HMR: `withSerialLock` drain prije `shutdown` RPC na captured worker referenci.

---

## Implementacioni sprint — sljedeći fajlovi

| Prioritet | Zadatak | Fajlovi |
|-----------|---------|---------|
| P1 | Essay wizard fix | ✅ fixed |
| P2 | Link modal lazy query | ✅ fixed |
| P2 | `draftJson` ref | ✅ fixed |
| P3 | `useCategoryStatsData` SQL (score denorm) | ✅ fixed |
| P3 | Shutdown lock drain | ✅ fixed |
| P2 | `React.memo(SourceReader)` | ✅ fixed |

---

## Fajlovi izmijenjeni u ovom auditu

- `src/store/useSourceReaderStore.ts` — legacy + splitMode cleanup
- `src/hooks/source-reader/useSourceMapping.ts` — commitMapping, separate mode removal
- `src/hooks/source-reader/useSourceReaderShortcuts.ts` — ProseMirror guard fix
- `src/hooks/useSourceReaderActions.ts` — scoped `useCardsBySource`
- `src/components/SourceReader.tsx` — `derived.sourceCards`
- `src/lib/db/queries/cards.ts` — `countDueCardsByCategoryFromDb`
- `src/hooks/card/useCardsQuery.ts` — SQL `useCategoryDueCounts`
- `src/lib/persistence/sqlite/serial-lock.ts` — novi modul
- `src/lib/persistence/sqlite/worker-client.ts` — serial lock + shutdown docs
- `src/lib/persistence/sqlite/opfs-worker.ts` — queue invariant docs
- `src/test/*` — shortcuts, shell mock, serial-lock, index migration
