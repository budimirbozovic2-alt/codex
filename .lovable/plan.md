# Deep Audit — Konsolidovani izvještaj i predloženi PR-ovi

4 paralelna audit agenta vratila ukupno **~95 nalaza**. Filterisao sam ih
po impact-u i grupisao u **7 PR bundle-ova (PR-H1 → PR-H7)**, redoslijed
preporučen po stvarnoj šteti × cijena fixa.

Tri stavke u "CRITICAL" tier-u su **ćutke aktivne greške u produkciji**
(double-FSRS-decay, XSS rupa, broad invalidation storm). One ulaze u PR-H1
i moraju ići prve.

---

## PR-H1 — CRITICAL fixes (data corruption, XSS, perf storm)

Po jedan bug, sve jednodnevne hirurške izmjene. Svaka stavka dolazi sa
regresionim guard testom.

### 1. **`gradeSection` dvaput primjenjuje FSRS patcher** 🔴
`src/hooks/card/useCardMutations.ts:198-203`
`onMutate` zove `optimisticPatch(qc, cardId, patcher)`, a zatim `mutationFn`
čita **već-patchovanu** karticu iz cache-a i ponovo primjenjuje isti
patcher prije upisa u SQLite. FSRS memorija se duplo dekejuje na svaku
ocjenu.
- **Fix:** `mutationFn` čita pre-patch karticu iz SQLite (`getCardsByIds`),
  ili `onMutate` predaje snapshot kroz mutation context.
- **Guard:** test koji ocijeni karticu i provjeri da je `stability` jednak
  FSRS-očekivanoj vrijednosti za jednu primjenu, ne dvije.

### 2. **`autoFormatArticles` zapisuje `innerHTML` bez DOMPurify** 🔴
`src/lib/article-autoformat.ts:28,35`
`el.innerHTML = \`<strong>${el.innerHTML}</strong>\`` na user-supplied
izvoru — XSS payload u "Član X" bloku se re-injektuje neočišćen. Krši W7
posture.
- **Fix:** `document.createElement("strong")` + `appendChild` umjesto
  innerHTML round-trip.
- **Guard:** test koji ubaci `<img src=x onerror=...>` u članak i provjeri
  da ne preživi format korak.

### 3. **`settle()` invalidira cijeli `['cards']` korijen na svakom write-u** 🔴
`src/hooks/card/useCardMutations.ts:156`
`save`/`remove`/`gradeSection` zovu broad invalidate iako bridge već
emituje scoped invalidation kroz `notifyCardsChanged`. Dupla refetch
ekplozija na svaki kartični write.
- **Fix:** `settle()` ostaje samo u `bulkUpsert`/`bulkPatch`; ukloniti iz
  single-card mutations.
- **Guard:** spy na `qc.invalidateQueries`, ocijeni karticu, expect ≤ 1
  scoped poziv.

### 4. **`ExportImportDialog` proguta sve greške i zaledi UI** 🔴
`src/components/ExportImportDialog.tsx:43,49,53`
Bez `try/catch` oko `validateImportFile`; finally + zatvori dijalog na
export failure → nula feedback-a korisniku.
- **Fix:** wrap u try/catch, prikaži error step + toast.

### 5. **`console.error/warn` u produkcijskim runtime handler-ima** 🟠
`src/main.tsx:44,47,125`, `src/components/ExportImportDialog.tsx:76`,
`src/lib/migrations/backup-schema/helpers.ts`
Vite `esbuild.pure` ne tree-shake-uje `console.error`. Stack-trace-ovi i
schema warning-i cure u packaged Electron build.
- **Fix:** sve kroz `logger.error`/`logger.warn`.

---

## PR-H2 — Optimistic mutation safety net ✅ DONE

Implementirano:

- **`useSourceMutations.save/remove`** — dodat `onSettled` safety-net koji
  invalidira `queryKeys.sources.all()` i `byCategory(catId)`. Bridge listener
  ostaje primarni okidač refetcha; ovo pokriva HMR/tear-down race u kojem
  je listener trenutno odvojen.
- **`saveDisciplineLog`** (`src/domains/planner/discipline.ts`) — sad async;
  snapshotuje `disciplineCache`, await-a `savePlannerDisciplineLog`, i na
  throw vraća cache + rethrowa. `recordDayDiscipline` postaje async; jedini
  caller (`usePlannerMutations.recordDiscipline.mutationFn`) već awaitao.
- **`src/lib/db/queries/planner.ts::saveDisciplineLog`** — više ne guta
  greške; nakon `logger.warn` rethrowa, pa mutation rollback uopšte radi.
- **`deleteSourceAndUnlinkCards`** (`src/lib/db/queries/sources.ts`) — u
  catch grani re-encode-a sad izvršava `UPDATE cards SET sourceId = NULL`
  (čisto kolonski fallback) i kartica se i dalje pushuje u `clearedIds`
  tako da `_cardLinkListeners` čuju invalidaciju. Bez ovoga embedded JSON
  `sourceId` kuca i nakon brisanja izvora.
- **`saveReviewSession`** (`src/lib/review-session-storage.ts`) — sad
  rethrowa umjesto `logger.debug` swallow-a.
- **`ReviewSession.saveSessionState`** — await + `toast.error` na failure;
  fallback static `toast`/`logger` importi (bez dynamic import noise-a).

Guards (`src/test/pr-h2-mutation-safety-net.test.ts`):
- #1 mock `savePlannerDisciplineLog` → throw, dokazuje rollback + rethrow.
- #2 static guard u `sources.ts`: column-only UPDATE postoji, `clearedIds.push`
  je nakon zatvaranja catch bloka.
- #3 mock `putSetting` → throw, dokazuje da `saveReviewSession` propaguje.
- #4 static guard: oba `onSettled`-a u `useSourceMutations.ts`.

Reviewer ostavlja `reviewLogApplied` granu netaknutom — promjena na "svi
strategi" je semantički non-trivial (`keep`/`skip` bi pregazili user log)
i dolazi u zaseban PR sa explicit merge strategijom.

Vitest: `pr-h1 pr-h2 pr-g7 cards-e2e-smoke` → 17/17 ✓.

---

## PR-H3 — Perf: search index + worker offload

### A. GlobalSearch full-text index
`src/components/GlobalSearch.tsx:98-100` i `useCardViewFilters.ts:133`
`derivePlainText(s.contentDoc).toLowerCase()` zove se po sekciji × po
kartici × po keystroke. Trenutno WeakMap kešira plain, ali ne lowercased.
- **Fix:**
  1. Drugi WeakMap layer u `derived.ts` za lowercased verziju.
  2. Pre-build flat `Map<cardId, searchString>` u `useMemo([cards])`,
     filter nad tim umjesto nad sekcijama.

### B. Heavy memos na main thread
- `useCognitiveStats.ts:16-23` — 3 storage read-a unutar `useMemo`
  po cards change → zamijeniti stable selektorima.
- `usePlannerData.ts:110` — `generateStudyPlan` (577 LoC) sinkrono u memo
  → routirati kroz `analyticsClient` (worker već postoji).
- `useDashboardData.ts:164-177` — `autoRedistributeIfNeeded` re-trigger na
  svaku optimističku patch (novi `cards` ref) → gate na stable
  `hashCards(id+updatedAt)`.

### C. BackupCard / NudgeWatcher prekomjerno subscribe-uju
`src/components/dashboard/BackupCard.tsx:21`, `src/components/MainLayout.tsx:38`
Ne renderuju `cards` — samo ga drže u closure-u za rijetki click handler.
- **Fix:** zamijeniti `useCardData()` sa `qc.getQueryData(...)` u callback
  trenutku → uklanja subscription, eliminiše re-render na svaku karticu.

---

## PR-H4 — Wall violations (W6/W8) + orchestrator pattern

ESLint nije ulovio jer su importi iz `@/lib/db/queries` (sanctioned
barrel), ali kontekst pogrešan.

### Wall fixes
- `components/RemapFromBackupDialog.tsx:18` — `notifyCardsChanged` direktno
  iz UI komponente → premjestiti u hook.
- `components/export-import/useImportValidation.ts` — hook (no JSX) pod
  `components/` putanjom; lomi Fast Refresh konvenciju → move u
  `src/hooks/useImportValidation.ts`.
- `components/SRSettingsPanel.tsx:12`, `components/SourceReader.tsx:6`,
  `SourceToolbar.tsx:8`, `SmartSplitSummaryDialog.tsx:9` — direktan
  `@/store` import iz duboko ugnježdene komponente → kompozicija kroz
  parent hook.

### Orchestrator drain
Komponente koje treba pretvoriti u dumb render + extract hook:
- `LearnSession.tsx` (13× useState + `loadLearnProgress` + `addActivityEntry`
  inline) → `useLearnSession` hook.
- `ReviewSession.tsx` (7× useState + `loadSavedReviewSession`) → `useReviewSession`.
- `ZenMode.tsx` (`addPomodoroEntry`/`getPomodoroStats` direktno) → kroz
  postojeći `usePomodoro` hook.
- `ReviewCard.tsx:10` (`addLatencyEntry` inline) → `useLatencyTracker` hook.

ESLint rule dodatak: blokirati direktan `@/lib/metacognitive-storage` import
iz `src/components/**`.

---

## PR-H5 — A11y baseline (W15)

- **Skip-to-content target nedostaje `tabIndex={-1}`**
  (`src/components/MainLayout.tsx:227`) — fokus skoči se tiho gubi u
  WebKit/Firefox.
- **Form fields bez `aria-invalid` / `aria-describedby`**
  (`src/components/card-form/MetadataSection.tsx`, `CardForm.tsx`) — 18
  kontrola, 0 anotacija; greške nisu programski povezane sa poljem.
- **`<label>` bez `htmlFor`** na Radix `<SelectTrigger>` u MetadataSection.
- **Dialog focus return** — custom (non-Radix) dijalozi (`ExamSidebar`,
  `LinkToExistingCardModal`) ne vraćaju fokus na trigger.
- **ReviewCard `Space` `preventDefault()` window-wide** — guard sa
  `isEditableTarget(document.activeElement)`.
- **Hotkey hardening:** dodati `{ ignoreInEditable: true }` u
  `useGlobalHotkey` poziv iz `ReviewCard.tsx:74`.

Nove ESLint rule (W15): warn na `useGlobalHotkey` poziv bez `opts` argument.

---

## PR-H6 — CardViewTable virtualizacija + memo stabilnost

- `CardViewTable` nema virtuelizaciju iako iste table mogu imati 200-500
  redova → primijeniti `react-window` po šablonu iz PR-G5
  (`VirtualSortableCardList` može poslužiti kao referenca).
- `CardViewMode.tsx:325` — inline arrow `onOpenMoveModal` busta `React.memo`
  na svakom render-u → wrap u `useCallback([])`.
- `CardViewMode.tsx:69-75` — `onFiltersChange` snapshot kao novi objekat
  literal na svaki state change → `useMemo` snapshot + `useCallback`.
- `AppSidebar` — `useCategoryStatsData` vraća novu referencu i kad su
  brojevi identični → `shallowEqual` selektor.
- `useDashboardData.ts:219-234` — O(N×M) `categoryRecords.find` u `.map()`
  → pre-build `Map<id, name>`.

---

## PR-H7 — Dead code / duplikati / test gap drain

### Dead/passthrough
- `hooks/useSession.ts` — 100% re-export iz `@/store/useSessionStore`,
  3 call site-a → inline + delete (3 file delta).
- `lib/cognitive-analytics.ts` — comment kaže "thin shim", samo
  `calcWeakHooks` se koristi → inline + delete.
- `domains/cards/index.ts` — prazan `export {}`, ESLint wall radi po path
  pattern-u, ne barrel → ili populate ili dodati jasan TOMBSTONE komentar.

### Duplikati
- `crypto.randomUUID()` na 17+ call site-ova → router kroz `@/lib/ids`
  factory funkcije sa branded ID-ovima.
- `Section` interface duplo (`lib/sr/types.ts:12` vs
  `lib/docx/splitIntoSections.ts:28`) sa nekompatibilnim oblicima →
  rename docx verzije u `SectionDto`.
- `addActivityEntry` direktno u `LearnSession:204` i `ReviewSession:43`
  iako `useActivityTracker` hook već postoji → migrirati call site-ove.
- `mindmap-constants.ts:4` — `let nodeIdCounter` mutable counter u "pure
  constants" file-u → `crypto.randomUUID()` ili `@/lib/ids`.

### Test gap
Dodati po jedan smoke + jedan happy-path test za:
- `lib/metacognitive-storage.ts` — `addActivityEntry`, `getCalibrationStats`,
  `getLearningVelocity` (0 testova).
- `lib/backup/import-remap.ts` + `write-satellite-tx.ts` — remap nakon
  schema-version mismatch (0 testova).
- `lib/review-session-storage.ts` — pause/resume round-trip (0 testova).

---

## Tehnički detalji za implementaciju

```text
PR redoslijed (preporučen):
  PR-H1 (kritičnih 5)        ─┐
  PR-H2 (mutation safety)    │  Sigurnost + data integritet first
  PR-H3 (perf — search/worker)
  PR-H4 (walls + orchestrator)  Arhitekturna disciplina
  PR-H5 (a11y baseline)
  PR-H6 (table virt + memo)     Final perf polish
  PR-H7 (dead code drain)
```

**Stvari koje NISU u planu** (svjesno isključeno):
- Migracije IDB → SQLite već su drain-ovane (Phase C).
- Stavke označene kao P2 housekeeping (i18n layer, branded-ID rebranding
  postojećih ID-ova) — ne donose dovoljno value-a za sada.
- Sve što duplira posao iz PR-G3..G8.

**Estimat:** PR-H1 = ~3h, PR-H2 = ~4h, PR-H3 = ~6h, PR-H4 = ~8h, PR-H5 =
~5h, PR-H6 = ~4h, PR-H7 = ~6h. Ukupno ~36h fokusiranog rada za potpuni
drain.

Predlažem da krenemo sa **PR-H1** odmah — to su 4-5 small but mean bugova
koji rade tihu štetu već danas.
