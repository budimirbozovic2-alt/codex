# Principal Architect — Code Review (SSOT / SOA / UI-Logic)

Skener: 6 najvećih i arhitektonski najopterećenijih fajlova. Skala A (besprijekorno) → F (kritično). "Kritični nalazi" navode tačne brojeve linija u trenutnom kodu.

---

## 1) `src/components/HealthMonitor.tsx` — 394 LOC

**SSOT: D** · **SOA: F** · **UI vs Logika: D**

### Kritični nalazi
- **SOA (F)**: Komponenta direktno čita Dexie tabele — 11 paralelnih `db.*.count()` poziva u `refresh` (L65-77), `db.cards.toArray()` + `db.categories.toArray()` (L99-102), `db.cards.update(...)` u `handleCleanOrphans` (L156). Nema Service/Repository sloja; "health" domen je rasut po komponenti.
- **SSOT (D)**: 13 `useState` polja (L49-60) reprezentuju kalkulisana stanja koja **nijesu izvorna** — `orphans`, `staleSub`, `staleChap`, `tableStats`, `idbEstimate` su svi izvedeni iz IDB snapshot-a + `categoryRecords`. Mogu da diverguju od `AppContext.categoryRecords` (SSOT) jer se računaju nezavisnim `db.categories.toArray()` (L101) umjesto da konzumiraju context.
- **UI/Logika (D)**: Detekcija orphan/stale veza (L98-131) je 30+ linija domain logike unutar render fajla. `loadCrashLog` (L39-46) parsira `localStorage` direktno. `formatBytes` (L33-37) je domain helper koji nema mjesto u UI fajlu.
- **Skriveni državni leak**: `localStorage.removeItem("codex-crash-log")` u UI handleru (L193-194) — perzistencijski API izlivaen direktno u JSX kontekst.

### Refaktor-plan (cilj: A/A/A)
```text
src/lib/services/healthService.ts      ← getTableStats(), detectOrphans(), detectStaleLinks(), getCrashLog(), clearCrashLog()
src/lib/repositories/cardRepository.ts ← već postoji; dopuniti countAll(), findOrphans(validIds), findStaleLinks(taxonomy)
src/hooks/useHealthMonitor.ts          ← orchestrator: useEffect → healthService.snapshot(), izvedeni state preko useMemo
src/components/HealthMonitor.tsx       ← samo JSX (cilj < 150 LOC), prima `report` i `actions` iz hook-a
```
- `categoryRecords` iz AppContext-a postaje **jedini** izvor taksonomije za stale-detection (eliminiše divergenciju sa IDB).

---

## 2) `src/components/subject-cards/LocalSpeedReader.tsx` — 606 LOC

**SSOT: C** · **SOA: C** · **UI vs Logika: F**

### Kritični nalazi
- **UI/Logika (F)**: 14 `useState` + 13 `useEffect` u jednoj komponenti — klasičan "Fat Component". Filter-validation effect (L77-87), filter-persist effect (L90-97), index-clamp effect (L113-115), focus-card effect (L119+) — svi poslovni invarijanti tutkani u UI fajl.
- **SSOT (C)**: `subFilter/chapterFilter/typeFilter` su `useState` (L71-73) **inicijalizovani iz localStorage-a**, a paralelno se persistiraju u `useEffect` (L90-97). Klasična ručna sinhronizacija dva izvora — bilo koja komponenta koja čita isti `FILTER_KEY` može da diverguje.
- **SOA (C)**: `loadFilters` (L45-59) i `FILTER_KEY` (L37) su perzistencijski helper-i ulijepljeni u prezentacioni fajl. `retentionColor` (L61-65) je domain mapper koji bi trebalo da živi pored `mastery.ts`.
- **UI/Logika**: Komponenta direktno orkestrira `buildSegments`, `getActiveSegment`, `cleanForTTS`, TTS settings load/save (L19-25) — RSVP engine logika curi u JSX wrapper.

### Refaktor-plan
```text
src/lib/speed-reader/filterStorage.ts  ← loadFilters(), saveFilters() (čista funkcija + Zustand opcionalno)
src/hooks/speed-reader/useSpeedReaderFilters.ts ← jedan hook: filter state + validation + persist (zamjena za 3 useState + 2 useEffect)
src/hooks/speed-reader/useSpeedReaderEngine.ts  ← segments, currentIndex, play/pause, TTS — domain orchestrator
src/components/subject-cards/LocalSpeedReader.tsx ← presentational shell; cilj < 200 LOC
```

---

## 3) `src/views/ZettelkastenView.tsx` — 596 LOC

**SSOT: B** · **SOA: B-** · **UI vs Logika: C**

### Kritični nalazi
- **SSOT (B)**: `articles` su izvor istine u `useZettelkastenBootstrap`, ali `flushDraft` (L148-184) izvodi **paralelni read** preko `getArticle(activeId)` (L154) jer sumnja u svježinu tog izvora — to je tihi priznanik da bootstrap state nije pouzdana SSOT za sve mutacije. Prihvatljivo, ali curi: nakon `saveArticle` se `setArticles(prev → ...)` (L181) izvršava ručno + emituje event (L182) — dva mehanizma sinhronizacije za isti zapis.
- **UI/Logika (C)**: 596 LOC u **jednom view fajlu**. Orkestracija mutacija (`handleCreate`, `handleOpen`, `handleBackToIndex`, `handleEnterEdit`, `handleSaveAndClose`, `handleDelete`, `handleWikiLink`, `handlePickMindMap`) — sve poslovne komande žive uz JSX. `handleWikiLink` (L308-355) ima netrivijalnu in-flight Map dedupe logiku (L306, L326-351) koja pripada hook-u, ne komponenti.
- **UI/Logika**: `existingTitleSet`/`emptyTitleSet` (L108-137) — 30 linija index-building logike; trebalo bi živjeti u `useArticleIndex(articles)` hook-u.
- **SOA (B-)**: View direktno zna za `bulkCreateArticlesIfMissing`, `findArticleByTitle`, `getArticle`, `saveArticle`, `deleteArticle`, `newArticle`, `backlinkIndex`, `eventBus`, `normalizeAliasList`, `useCategorySources`. 7 različitih domain modula — pojam "view" je razvodnjen.

### Refaktor-plan
```text
src/hooks/zettelkasten/useArticleMutations.ts ← create/open/delete/wikiLink + flushDraft + in-flight dedupe
src/hooks/zettelkasten/useArticleIndex.ts     ← existingTitleSet, emptyTitleSet (memoized)
src/hooks/zettelkasten/useDraft.ts            ← draft state + dirty check + flush coordination
src/views/ZettelkastenView.tsx                ← orchestrator-tanak: composes hooks, renders ZettelExplorerPanel + main pane; cilj < 250 LOC
```
- Eliminiše dupli sync (setArticles + eventBus) tako što storage layer **sam** emituje event, a `useArticleMutations` sluša bus za state update — jedan tok podataka.

---

## 4) `src/hooks/useSourceReaderActions.ts` — 525 LOC

**SSOT: C** · **SOA: D** · **UI vs Logika: B** (jeste hook, ne JSX, ali domenske granice probija)

### Kritični nalazi
- **SOA (D)**: Hook miješa **četiri domena** u jednoj datoteci: (a) selection UI handlers (L32-65), (b) Card creation orchestration sa `addCard`/`patchCard` (L99-204), (c) Exam-mapping mutacija (L207-247), (d) DOM heading manipulation (L249+). Plus direktno zove `incrementDailyMapped` iz **Planner** domena (L4, L129, L166, L234, L244) — Zettelkasten/SourceReader → Planner side-effect bez interfejsa. Krši "Domain Scoping" Core memory pravilo.
- **SSOT (C)**: Hook miješa Zustand store (`useSourceReaderStore.getState()`) sa AppContext (`useCardData`, `useCardOnlyActions`) i emituje `window.dispatchEvent("codex-mapping-created")` (L130, L167) — treći invalidacijski kanal pored eventBus-a i context refresha.
- **UI/Logika**: Direktno DOM-om manipuliše: `window.getSelection()`, `range.cloneContents()`, `wrapper.innerHTML` (L34-53). DOM kod treba u `domSelection.ts` utility, ne u hook.

### Refaktor-plan
```text
src/lib/source-reader/dom-selection.ts        ← captureSelection() → {text, html, rect}
src/hooks/source-reader/useSelection.ts       ← mouseUp/mouseDown handlers + Zustand sync
src/hooks/source-reader/useCardCreation.ts    ← handleSmartSplitConfirm, handleLinkConfirm
src/hooks/source-reader/useExamMapping.ts     ← handleMapSelection (jedini koji smije pozvati Planner)
src/lib/planner/api.ts                        ← već postoji indirekcija; OBAVEZA: nikad ne import-ovati planner-storage iz Zettelkasten/SourceReader hooks; prolaz isključivo kroz event bus (KARTICA_KREIRANA → Planner sluša i inkrementira)
```

---

## 5) `src/components/AutoSplitDialog.tsx` — 464 LOC

**SSOT: C** · **SOA: D** · **UI vs Logika: D**

### Kritični nalazi
- **SOA (D)**: `import { db } from "@/lib/db"` (L17) + `db.cards.count()` (L254) **u UI komponenti**. Verifikacioni read poslije bulk write — to je integration-test logika, ne UI odgovornost.
- **UI/Logika (D)**: `buildRows`, sections/anchor builder, kompletna split-and-import orkestracija (L65-264) — **200 linija domain logike** prije nego prvi JSX. Komponenta zna za `createCard`, `createTextAnchor`, `sanitizeHtml`, `persistQueue.flush()`.
- **SSOT (C)**: `linkedCards` (L60-63) se filtrira iz context-a — OK. Ali `existing` matching radi se **stringly-typed** (`q.includes('čl. X ')` L68-70) — fragilno; nije kanonizovan ID. Dva izvora identiteta članova: `articleNum` polje + parsiran tekst pitanja.
- **UI/Logika**: Verbose `console.log` u `if (import.meta.env.DEV)` (L255) — diagnostički kod u prezentaciji.

### Refaktor-plan
```text
src/lib/auto-split/import-plan.ts        ← buildRows(), buildPlan(rows) → {newCards, updates}
src/lib/auto-split/import-executor.ts    ← executeImport(plan, ctx) → Promise<{created, updated}>; zove persistQueue + verifikaciju
src/hooks/useAutoSplitImport.ts          ← state machine: detect → preview → import → done
src/components/AutoSplitDialog.tsx       ← samo JSX + dialog state; cilj < 180 LOC
```
- Eliminiše `db.cards.count()` iz UI: verifikacija ide u repository (`cardRepository.assertWriteCommitted(ids)`).

---

## 6) `src/components/MnemonicTest.tsx` — 442 LOC

**SSOT: B** · **SOA: B** · **UI vs Logika: D**

### Kritični nalazi
- **UI/Logika (D)**: 12 `useState` + 5 `useMemo` + 2 `useEffect` + `timerRef` (L71-78). Komponenta sadrži kompletan test-engine state machine (`phase: selector|reminder|test|finished`) sa tajmerom, queue-om i statistikom.
- **UI/Logika**: `uuidToName` lookup (L27-36) se gradi unutar komponente — već postoji "UUID Display Policy" memory pravilo o automatskom mapiranju; trebalo bi koristiti centralizovan helper umjesto ad-hoc Map-a.
- **SSOT (B)**: `categoryTree` (L46-54) i `hookTypeCounts` (L56-60) su čisti derived state preko `useMemo` — to je **dobro**. `filteredTestable` (L63-69) takođe. Ali `queue` je `useState` koji se popunjava ručno — pitanje je da li drift od `filteredTestable` može da se desi (tipično: da, kad korisnik mijenja filter mid-session).

### Refaktor-plan
```text
src/hooks/mnemonic/useTestEngine.ts   ← phase machine + queue + timer + stats; vraća `{state, actions}`
src/lib/mnemonic/test-selection.ts    ← buildCategoryTree, hookTypeCounts, filterTestable (čiste funkcije, testabilne)
src/components/mnemonic/TestSelector.tsx + TestRunner.tsx + TestSummary.tsx  ← 3 prezentacione pod-komponente po phase-u
src/components/MnemonicTest.tsx       ← shell koji odabira pod-komponentu prema state.phase; cilj < 100 LOC
```

---

## Sumarno — sistemski obrasci koji se ponavljaju

1. **Direktan Dexie pristup iz UI**: `HealthMonitor` (15 mjesta), `AutoSplitDialog` (1), `category/SourceEditor` (1). **Pravilo**: nijedan fajl pod `src/components/**` ili `src/views/**` ne smije da `import { db } from "@/lib/db"`. Lint pravilo `no-restricted-imports` može ovo da forsira.
2. **Trostruki invalidacijski kanal**: state setter + eventBus emit + `window.dispatchEvent`. Konsoliduj na **eventBus** kao jedini interfejs između domena.
3. **localStorage ulijepljen u prezentaciju**: `LocalSpeedReader`, `HealthMonitor`. Sve perzistencijske ključeve premjestiti u `*-storage.ts` module sa SSOT slušaocima (kao što je već urađeno za sources/mindMaps po memory `ssot-storage-listeners`).
4. **Cross-domain side-effects bez interfejsa**: `useSourceReaderActions` → `incrementDailyMapped` (Planner). Krši Core "Domain Scoping". Riješiti event-busom: SourceReader emituje `KARTICA_MAPIRANA`, Planner sluša.

## Šta NE ulazi u ovaj plan
Ovo je **audit + refaktor blueprint**. Implementacija svake od 6 stavki je posebna sesija; preporučeni redoslijed po ROI: (1) HealthMonitor → (5) AutoSplitDialog → (4) useSourceReaderActions → (2) LocalSpeedReader → (3) ZettelkastenView → (6) MnemonicTest.
