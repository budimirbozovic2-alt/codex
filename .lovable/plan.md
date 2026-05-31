# Deep Audit — Memoria

Dva nezavisna subagenta (capable model) prošla su `src/`, configove i Electron sloj. Konsolidovano: **37 nalaza** (2 Critical, 11 High, 13 Medium, 4 Low). Niže su grupisani po **deep root cause**-u, ne po simptomu — pa je i plan organizovan oko tih korenova, ne oko file-by-file flastera.

---

## Root-cause klasteri

### RC-1 — Silent data loss (writes koje izgledaju kao da rade, a ne pišu)
Najveći rizik. Svi dijele isti patern: optimistični UI / localStorage write uspije, a SQLite SSOT write tiho pukne.

- **C-1** `useMnemonicMutations.saveCards` (`src/hooks/mnemonic/useMnemonicMutations.ts:52`) — `onMutate` radi `setQueryData(['mnemonics','all'], next)` gde je `next` samo subset za jednu kategoriju → ostale kategorije nestaju iz keša do `onSettled`. Treba **upsert merge po id** (kao `useKnowledgeBaseMutations`).
- **C-2** `saveAppSettings` / `saveSubjectSettings` (`src/lib/app-settings.ts:99-101`, `src/lib/subject-settings.ts:88-91`) — `import("@/lib/db/queries").then(...).catch(() => {})` — prazan vanjski swallow guta i import error i write error, dok localStorage write daje false confidence. Statički import + log/rethrow.
- **H-4** Electron quit-backup race (`src/lib/electron-integration.ts:164-175`) — 5s `Promise.race` timeout je premali za >5k kartica; kad timeout pobedi `notifyQuitBackupDone()` se zove a korisnik ne dobije toast → tihi gubitak backup-a. Bump na ≥15s + user-visible error + parallelize SQLite reads u `buildBackupData`.
- **M-2 / M-1** `reviewLogRepository.flush()` i `persist-queue` rescue timer ne brišu inflight `setTimeout` pre force-draina → **double-drain** u quit window-u (potencijal za duplikate u review log-u).

### RC-2 — Race-prone migration & boot path
Patern: paralelni efekti dele isti SQLite executor bez explicit gating-a.

- **#2 / Critical** PR9 M2 migration (`src/lib/persistence/sqlite/migrate-from-idb.ts:297,374`) — `writePR9Flag` se zove **bezuslovno** nakon tri nezavisna `try/catch` sub-stepa. Ako jedan padne, flag se ipak upiše → retry guarantee na sledećem boot-u izgubljen. Sakupi `allOk` bool i piši flag samo na potpunom uspjehu.
- **H-1** Boot `panicTimer` (`src/hooks/useCardBootstrap.ts:65`) — raw `setTimeout` invisible to `taskScheduler`; HMR re-mount može da napravi double-fire prozor.
- **#11** `scheduleLogPrune()` iz `bootDb` fire-and-forget tokom `runSchema()` → race na shared executor-u. Treba pomeriti iza `runSchema()` ili gate-ovati `taskScheduler.idle()`.
- **H-7** `useZettelkastenBootstrap.setArticles` (`:102-110`) — deprecated writer još uvek aktivan, `cancelQueries` + `setQueryData` izvan mutation lifecycle-a → bridge-cancel race. Obrisati; bridge već radi posao.

### RC-3 — Stale-closure / nedostajući remount kontrakti
Patern: efekti sa "intentionally stale" deps koji rade samo dok niko ne zaboravi `key={...}`.

- **H-5** `EditorSection` (`src/components/card-form/EditorSection.tsx:85-86`) — `useMemo(..., [])` seed ovisi o pozivaocu da postavi `key={card.id}`. Dodati dev-warning `useEffect` koji loguje ako `question` cross-render izmijeni vrijednost bez remount-a.
- **H-6** `LearnPage` (`src/views/LearnPage.tsx:53`) — `useEffect(..., [ready])`: `ready` se nakon boot-a nikad ne mijenja, ali komponenta se remounta pri navigaciji → React ne re-fire-uje effect; session se inicijalizuje **stale closure-om** iz prvog mount-a. Dodati `location.key` ili route-key u deps.
- **M-9** `GlobalSearch` (`:151`) — suppressed dep krije da se search index nikad ne rebuild-uje kad deferred card load dođe. Subscribe na `notifyCardsChanged` ili `cards` u deps sa preserve-query guard-om.
- **M-7** `MainLayout` planner-nudge IIFE (`:42-75`) — async `(async () => {...})()` bez cancellation token-a; `toast()` može ići na unmounted route. Standard `let cancelled = false` + cleanup.

### RC-4 — Timeri/listeneri izvan `taskScheduler` (memory-leak & test-isolation surface)
Sistemska disciplina; konstrakta već postoji, ali šest sajtova ga zaobilazi.

- **M-3** `bridges.ts:162,166` — `_trailingTimer`/`_maxWaitTimer` raw setTimeout, preživljavaju HMR; test-isolation hazard. Dodati `teardown()` i route preko scheduler-a.
- **M-5** `BlockingModal:35` — `setInterval` može držati renderer živim posle IPC teardown-a.
- **M-6** `useSpeedReaderEngine` TTS chain (`:100,108,133,142`) — `ttsTimeoutRef` se ne čisti u cleanup-u → setState-on-unmounted nakon nav-away mid-speech. Track sve timeout ID-ove + reset `ttsPlayingRef.current = false` u cleanup.
- **M-8** `usePomodoroStore` — `subscribe(...)` return value odbačen; u testovima duplicate listener.
- **L-3** `keyedMutex` global key nikad ne GC-uje `chains` Map entry. Trivijalan fix u `finally`.
- **L-4** `useZettelkastenBootstrap.ensureIndexArticle` (`:68-80`) bez `.catch` → permanent spinner state.

### RC-5 — Query-cache disciplina (excess Worker/CPU work)
TanStack je SSOT za reads, ali tri sajta krše konvenciju.

- **H-2** `usePlannerData.retentionRisk` (`:198-206`) — bez `staleTime`, default 0 → svaki mount/focus pokreće analytics Worker (O(n·m)). `staleTime: Infinity` (kao svi ostali query-jevi).
- **H-3** `usePlannerData` `reviewLogHash` (`:184,196`) — O(n) hash računat pa `void`-ovan. Obrisati, dodati kad zatreba.
- **M-4** `usePlannerData:189-191` — direct `invalidateQueries({queryKey: retentionRisk()})` bypass bridge-a. Dodati `"retentionRisk"` u `PlannerChangeKind` + bridge case; ukloniti effect.
- **#5 / #6** Analytics worker (`workerClient.ts`, `useAnalyticsWorker.ts`) — `loadDisciplineLog()` itd. pozivani per-call site bez memoizacije; `cards`/`reviewLog` array refs nestabilne → redundant worker invocations bez cancellation-a (Comlink nema). Snapshot once + hash-based deps.

### RC-6 — Render hot-paths bez memoizacije/virtualizacije
- **#9** `GlobalSearch:277` — unbounded `.map()`; `react-window` već u bundle-u (`MnemonicWorkshop`). Primijeniti FixedSizeList.
- **#10** `OrgSubcategoryPanel:78` — `OrgCardRow` bez `React.memo`; svaki DnD drag re-renderuje 200+ rows. Memo + komparator po `id`+`updatedAt`.

### RC-7 — Tooling/config rupe (zašto se RC-1…RC-4 stalno vraćaju)
Ovo je meta-uzrok: bez tooling guard-ova, prethodni klasteri se reintrodukuju.

- **#1** `tsconfig.app.json` — `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `noFallthroughCasesInSwitch: false`. `strictNullChecks` jeste uključen iz PR-E1, ali sve ostalo iz strict family-a je tiho ugašeno. Uključiti `strict: true` + selektivno relax tamo gdje je incrementally adoption-friendly.
- **#7** `tsconfig.app.json` `types: ["vitest/globals"]` curi u production source — `vi.mock()` u app kodu ne bi prijavio grešku. Premjestiti u zaseban `tsconfig.test.json`.
- **#12** `eslint.config.js` — `@typescript-eslint/no-unused-vars: "off"` globalno (re-enable samo za jedan fajl). Uključiti error rule + `^_` ignore pattern.
- **#13** `vitest.config.ts` bez `restoreMocks` / `clearMocks` / `unstubAllGlobals` → spy leakage između testova.

### RC-8 — Test flakiness (wall-clock / real-sleep ostaci)
PR-F je drenirao većinu, ali još osam mjesta:

- **#3** `planner-logic.test.ts:24-92` — `new Date()` / `Date.now()` u expect-ovima bez `vi.setSystemTime`.
- **#4** `setTimeout(r, 0)` "tick" helper u 5 test fajlova (card-bubble-menu, card-draft-autosave:81, cards-mirror-and-rollback:124 ×5 loops, editor-v4-cards, source-reader-in-place).
- **#8** `category-repository.test.ts:16,49` — real 10ms sleep posle `commit()` koji je već `await`-ovan; redundant + flaky.

### RC-9 — Security
- **#14** `main.cjs:84` `isTrustedSender` permituje *bilo koji* `http://localhost:*` u dev mode-u → drugi lokalni proces na Vite portu može preuzeti IPC origin. Pin na exact dev port (8080).

### RC-10 — Dead code / bundle
- **#15** `react-day-picker` u bundle-u samo radi `components/ui/calendar.tsx` koji nije konzumiran. Delete + `bun remove`.
- `react-window` (već potvrđeno koristi se u `MnemonicWorkshop`) — proširiti upotrebu u GlobalSearch (RC-6).
- `reviewLogHash` (RC-5).

---

## Predloženi PR-ovi (rangirano po ROI, izvodljivi nezavisno)

**PR-G1 — Silent data loss (RC-1)**
mnemonic merge upsert, statički import settings + log/rethrow, quit-backup timeout bump + user toast, force-flush guards (`reviewLogRepository`, `persist-queue`). 4-6 fajlova. Najviši ROI; bez ovog ostatak je akademski.

**PR-G2 — Migration & boot races (RC-2)**
PR9 M2 flag gate, `scheduleLogPrune` ordering, `useZettelkastenBootstrap.setArticles` brisanje, boot panicTimer → taskScheduler.

**PR-G3 — Stale closure i remount kontrakti (RC-3)**
LearnPage route-key, GlobalSearch index rebuild on `notifyCardsChanged`, EditorSection dev-warning, MainLayout cancellation token.

**PR-G4 — Timer/listener disciplina (RC-4)**
6 sajtova migrira na `taskScheduler` + cleanup; `keyedMutex` GC fix; `usePomodoroStore` unsubscribe; ZK ensureIndexArticle `.catch`. Dodati ESLint rule koja banuje `setTimeout`/`setInterval` van `taskScheduler`/`@/lib/motion`/`main.tsx` (guardrail protiv regresije).

**PR-G5 — Query cache & worker disciplina (RC-5)**
`retentionRisk` `staleTime: Infinity` + bridge integration, obrisati `reviewLogHash` dead code, analytics snapshot once + hash-based deps. Mjerljiv smanjenje Worker call-ova.

**PR-G6 — Render hot-paths (RC-6)**
GlobalSearch react-window, OrgSubcategoryPanel `React.memo`.

**PR-G7 — Tooling guardrails (RC-7) — META FIX**
`strict: true` (sa kontrolisanim relax-om za `noImplicitAny` ako potreban incremental), izdvojiti `tsconfig.test.json`, uključiti `no-unused-vars` error, `vitest.config.ts` restoreMocks/clearMocks. **Ovo radi posljednje** — flush iz G1-G6 prije nego se zatvore guardrails.

**PR-G8 — Test flakes & cleanup (RC-8, RC-9, RC-10)**
`vi.setSystemTime` u planner-logic, zamijena `tick()` helpera u 5 fajlova, ukloniti redundant sleep u category-repository, Electron `isTrustedSender` port pin, `react-day-picker` + `calendar.tsx` delete.

---

## Šta plan **ne** uključuje (eksplicitno)

- Funkcionalne promjene UX-a, FSRS algoritma, planner formule.
- Dodavanje novih feature-a.
- Refaktor domain walls W11-W14 (već stabilno).
- `motion` discipline (već zaključano PR-om iz memorije).
- Dexie / Ref-Delta / cardCommandBus — već u potpunosti uklonjeni; potvrđeno u auditu nema regresija.

---

## Otvorena pitanja prije eksekucije

1. **Skop:** da li krenemo samo sa **PR-G1 (Silent data loss)** kao standalone (najveći rizik, najmanji blast radius), pa ostalo redom?
2. **PR-G7 (strict: true):** očekujte ~50-150 novih TS grešaka pri flip-u. OK da G7 ima prateći "drain" PR (G7a) ili da prvo mjerimo i odlučimo?
3. **PR-G8 Electron port pin:** Vite port čitamo iz `vite.config.ts` (`8080`) ili iz env var-a? (preferable: env, otporno na future change.)