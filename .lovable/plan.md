# Deep Audit — konsolidovani nalazi i plan sanacije

Tri paralelna auditora (backup/SQLite/query, domain/hooks/FSRS, infra/lint/tests) vratila su 35+ konkretnih nalaza. Filtrirano po realnom uticaju i grupisano po root cause-u — ne po fajlu.

---

## TL;DR — najveće mete

**Mit "FK 787 je riješen" je djelimično tačan.** Defensive scrub kartica koji smo nedavno dodali maskira tri dublja root cause-a koji bi sami trebali biti popravljeni:

1. **`PRAGMA foreign_keys = ON` nije connection-scoped re-emitovan** — vrijedi samo tokom prve migracije; svaki kasniji boot otvara konekciju sa FK enforcement-om **OFF** (`migration-runner.ts:149` rano-return na `version === target`). FK greške 787 koje vidimo dolaze samo zato što import radi `DELETE FROM categories` koji ponovo trigeruje konstreint na sljedećem boot-u.
2. **`applyRemapToParsed` se zove na `merged` umjesto na `parsed.cards` PRIJE merge-a**, i uz to **mutira `currentMap` reference** koje pripadaju živom user-state-u (`import-remap.ts:58-64`).
3. **`pruneOrphans` mutira `parsed.sources` unutar `writeCategoriesTx`** koji se zove **prije** `writeSourcesTx` koji čita istu mutiranu listu (`write-categories-tx.ts:118` → `import-transaction.ts:124`). Dvostruki scrub tiho gubi source relacije umjesto da signalizira loš backup.

Ovo su HIGH/HIGH/HIGH stavke i čine srž **PR-A**.

---

## PR-A — Backup pipeline root cause sanacija (najveći ROI)

| # | Severity | Lokacija | Problem | Minimalna ispravka |
|---|----------|----------|---------|--------------------|
| A1 | HIGH | `persistence/sqlite/migration-runner.ts:149`, `client.ts`, `dev-fallback.ts` | `PRAGMA foreign_keys = ON` se emituje samo tokom migracije; svaki kasniji boot ima FK **OFF** | Premjestiti pragma u `wrapDb`/connection-open helper; emitovati uvijek pri otvaranju konekcije |
| A2 | HIGH | `backup/import-remap.ts:40-83`, `import-transaction.ts:64-71` | Remap se primjenjuje na `merged` poslije merge-a i mutira `currentMap` reference; remap nad nepostojećim cards je no-op uz silent state corruption | Pozvati `applyRemapToParsed` nad `parsed.cards` PRIJE `mergeCardsByStrategy`; ukloniti drugi pass nad `cardMap` |
| A3 | HIGH | `backup/write-categories-tx.ts:117-118` + `write-satellite-tx.ts:225-246` | `pruneOrphans` mutira `parsed.sources` prije nego ih `writeSourcesTx` pročita; dvostruki scrub tiho briše source relacije | Pozvati `pruneOrphans` **nakon** `writeSourcesTx`, ili izbaciti sources iz pruneOrphans (sources sami padaju na FK ako su orphan) |
| A4 | HIGH | `migration-runner.ts:158-166` | `PRAGMA user_version` unutar `exec.transaction` nije pouzdano durable u WAL+OPFS — krah između DDL-a i COMMIT-a re-runuje migraciju | Emitovati `user_version` van transakcije, nakon uspješnog COMMIT-a |
| A5 | MED | `backup/migrate.ts:24-28` | Migracije v1–v4 su no-op `(b) => b` identiteti — dead code u ladderu | Obrisati prazne korake; ladder kreće od v5 |
| A6 | MED | `backup/write-satellite-tx.ts:297-304` | "Aditivni" KV write može pregaziti `migrated-from-idb-v1` flag → puna IDB→SQLite re-migracija na sljedećem bootu | Eksplicitan blocklist ključeva (`PROTECTED_KV_KEYS`) koji se preskaču u INSERT OR REPLACE |
| A7 | MED | `backup/write-cards-tx.ts:31-47` + `import-types.ts:13` | `"keep"` i `"skip"` strategije su identične — jedna je dead variant | Obrisati jednu iz `ImportStrategy` ili dokumentovati razliku i dodati test |
| A8 | MED | `backup/import-remap.ts:30-33` | Case-insensitive name remap može stvoriti duplikate ako kategorije postoje sa različitim case-om (`History` vs `history`) | Normalizovati na `toLowerCase()` jednom i deduplikovati prije remap-a; emitovati upozorenje |

**Nakon A1+A2+A3:** defensive scrub kartica koji smo dodali postaje sigurnosna mreža (kao što i treba da bude), a ne primarni filter.

---

## PR-B — Hard data-loss bugovi (FSRS, mutations, races)

| # | Severity | Lokacija | Problem | Fix |
|---|----------|----------|---------|-----|
| B1 | HIGH | `hooks/useCardCRUD.ts:160-161` `splitCard` | `bulkUpsert` i `remove` paralelno; ako `bulkUpsert` ne uspije a `remove` prođe → **trajni gubitak kartice** | Sekvencijalno: `await bulkUpsert` prije `await remove`; try/catch sa toast rollback-om |
| B2 | HIGH | `lib/sr/algorithm.ts:83-152` | New card + grade 1 ili 2 pada u pogrešnu granu (`stability * 0.05 = 0` → clamp 0.1 → interval ≈ 1 min); samo grade 3/4 imaju explicit New override | Dodati explicit New-card grane za grade 1 (1 min step) i grade 2 (10 min step), oba sa `firstReviewPending=true` |
| B3 | HIGH | `domains/cards/cardMapWrites.ts:197-226` | `_fetchSequence` race: dva concurrent caller-a oba inkrementuju → oba `currentSequence !== _fetchSequence` → oba bail-out, mapa ostane nesinhronizovana | Zamijeniti sa coalescing pending-promise pattern-om (jedan in-flight refetch, novi callers čekaju isti Promise) |
| B4 | HIGH | `lib/repositories/reviewLogRepository.ts:24-32` | Retry radi `_queue.unshift(...batch)` bez backoff-a i max-retry cap-a; pri konstantnoj grešci queue raste neograničeno + ruši temporal ordering | Odvojiti `_retryBacklog`; eksponencijalni backoff sa max retries; `push` umjesto `unshift` |
| B5 | MED | `hooks/useMnemonicMutations.ts:42-82` | Optimistic `setQueryData` zamjenjuje cijeli `mnemonics.all()` cache sa subset-om koji je caller proslijedio → ostale kartice nestaju do sljedećeg refetch-a | Merge u postojeći cache umjesto replace |
| B6 | MED | `hooks/useCardCRUD.ts:134-145` | `try { void mutateAsync() }` — `void` discard čini catch dead code; `toast.success` se okida prije persist-a | `await` u async callback-u, ili pomjeriti toast u `onSuccess` mutation handler |
| B7 | MED | `hooks/useCardCRUD.ts:96-130` | `if (updates.question)` truthy guard tiho ignoriše `""` (intencionalni reset) i prazan `categoryId` | Promijeniti na `updates.question !== undefined` |
| B8 | MED | `domains/cards/cardMapWrites.ts:69-71` | `put()` čuva postojeći `updatedAt` ako je truthy → dva save-a u različitim vremenima imaju isti timestamp → "newer wins" merge se ruši | Uvijek stampovati `Date.now()`; eksplicitni flag ako caller želi sačuvati |
| B9 | MED | `domains/planner/discipline.ts:11-13` | `saveDisciplineLog` fire-and-forget bez catch/rollback; cache i SQLite se divergiraju pri write fail-u | `.catch(() => { disciplineCache.set(prev); logger.error+toast })` |
| B10 | MED | `domains/planner/cache.ts:100` | `snap.disciplineLog as DisciplineEntry[]` cast bez null guard → runtime crash na first boot | `Array.isArray(...) ? ... : []` |

---

## PR-C — Query layer & EditorView fix (suptilni perf/leak bugovi)

| # | Severity | Lokacija | Problem | Fix |
|---|----------|----------|---------|-----|
| C1 | MED | `lib/query/bridges.ts:203-205` discipline | `setQueryData` + `invalidateQueries` na istom ključu = stale-flicker prozor + dupli posao | Ostaviti samo `setQueryData` (uskladiti sa `config` granom) |
| C2 | MED | `lib/editor-v4/EditorView.tsx:52-57` | Cleanup `useEffect(..., [])` čuva `editor=null` iz prvog render-a → TipTap instance se **nikad ne destroy-uje** na unmount → ProseMirror memory leak | `editorRef.current = editor` + cleanup čita ref; ili obrisati ako `useEditor` sam radi cleanup |
| C3 | MED | `lib/editor-v4/EditorView.tsx:30` | `useMemo([doc])` re-serijalizuje cijeli AST na svaki render kad je samo `doc` reference nova | Dep `[doc.content]` |
| C4 | MED | `lib/editor-v4/EditorView.tsx:45-50` | `doc` u effect deps → nepotreban teardown ciklus svaki render | Skinuti `doc` iz deps, čitati preko ref-a |
| C5 | LOW | `store/useCardSelectors.ts:65-72` | Shallow array stability check ne sortira → reordering daje novu referencu i re-render | Sortirati po id prije poređenja, ili Set comparison |
| C6 | LOW | `store/useCategoryStore.ts:85-106` | `getServerSnapshot` vraća `fallback` uvijek → svaki mount ima flash sa praznim podacima čak i kad je store popunjen | Server snapshot čita iz live store-a |
| C7 | LOW | `hooks/useCardDraftAutosave.ts:95-101` | `draftKey` promjena rekreira debounce bez flush → zadnji keystroke se gubi | `prev.flush()` prije rekreacije |
| C8 | LOW | `lib/backup/json-serialize-client.ts:85-87` | Worker teardown samo pod `import.meta.hot` → PROD nikad ne termine | `window.addEventListener("beforeunload", terminateJsonSerializeWorker)` |

---

## PR-D — Infra / boot path

| # | Severity | Lokacija | Problem | Fix |
|---|----------|----------|---------|-----|
| D1 | HIGH | `lib/electron-integration.ts:161` + `contexts/AppBootstrap.tsx:55` | Dva nezavisna `onQuitBackupRequested` handlera — duplo flushovanje, dupli `notifyQuitBackupDone`, race u finally | Obrisati handler iz `AppBootstrap`; quit logika živi samo u IPC modulu |
| D2 | HIGH | `contexts/AppContext.tsx:64-73` + `useCardBootstrap` | `AppBootstrap` živi van `RecoveryGate` — DB error ne zaustavlja boot DAG → boot hooks se i dalje rotiraju protiv broken DB-a | Guard u `useCardBootstrap`: ako `useDbError() !== null`, abort/defer dok user ne potvrdi recovery |
| D3 | MED | `main.tsx:187` + `vite.config.ts esbuild.pure` | `console.warn` na IPC setup fail-u se eliminiše u PROD → nevidljiv boot-path failure | Zamijeniti sa `logger.warn(...)` |
| D4 | LOW | `lib/electron-integration.ts:18` | `assertDesktop` izvozen, nigdje se ne importuje (dead) | Obrisati ili re-wire u `main.tsx` boot gate |
| D5 | LOW | `App.tsx:60-63` | `installBodyPointerEventsGuard` u `useEffect` → instaliran tek poslije first paint, prozor curenja postoji | Pozvati prije `createRoot().render()` u `main.tsx` |

---

## PR-E — Lint walls & TS strictness (sistemski risk)

| # | Severity | Lokacija | Problem | Fix |
|---|----------|----------|---------|-----|
| E1 | HIGH | `tsconfig.app.json`, `tsconfig.json` | `strict: false`, `strictNullChecks: false`, `noImplicitAny: false` — TS sigurnost isključena globalno; ESLint `no-explicit-any: error` štiti samo eksplicitne `any`, ne implicitne | Inkrementalno: prvo `strictNullChecks: true` (najveći ROI), zatim `noImplicitAny`, na kraju `strict` |
| E2 | HIGH | `eslint.config.js` global `no-restricted-syntax` | Raw-color i G7/W5/PR1 walls su `"warn"` u kombinaciji sa `--max-warnings=80` → do 80 violation-a prolazi CI | Promijeniti u `"error"`; postojeće `"off"` per-file override-i pokrivaju legit slučajeve |
| E3 | MED | `package.json scripts.lint` | `--max-warnings=80` — previše dozvoljeno | Spustiti na 0 nakon E2 |
| E4 | MED | `eslint.config.js` | Naredni `no-restricted-syntax` blokovi **zamjenjuju** prethodne za matching files (ne kompoziciono mergeuju) → W7 fajlovi ne vide G7 timer ban ni W5 event-bus ban | Konsolidovati u jedan blok ili koristiti shared array konstantu |
| E5 | LOW | `src/lib/motion/index.ts` + W10 | W10 ne banuje `"m"` iz `framer-motion` → moguć bypass barrel-a | Dodati `"m"` u W10 importNames ban |

---

## PR-F — Test suite & dead code cleanup

| # | Severity | Lokacija | Problem | Fix |
|---|----------|----------|---------|-----|
| F1 | HIGH | `test/card-draft-autosave.test.ts:53,72,81,90` | 4× real `sleep(900)` za debounce → +3.6s suite, flaky na sporom CI | `vi.useFakeTimers()` + `advanceTimersByTimeAsync` |
| F2 | MED | `test/persist-queue-c3c4.test.ts:27`, `cards-mirror-and-rollback.test.tsx:141` | Real sleeps (50ms, 30ms) — wall-clock zavisnost | `waitFor(() => !persistQueue.hasPending())` poll |
| F3 | MED | `package.json` | `react-window` + `@types/react-window` decl, 0 importa | `bun remove` |
| F4 | LOW | `lib/editor-v4/lazy-migrate.ts:9`, `lib/drafts/draftsTable.ts:5`, `lib/db/queries/index.ts:11`, `store/useCardSelectors.ts:5-9` | Komentari pominju uklonjene sisteme (Dexie, liveQuery, Ref-Delta, outbox) | Update doc strings |
| F5 | LOW | 11 sajtova `// eslint-disable-next-line react-hooks/exhaustive-deps` bez justifikacije | Ne razlikuje se intentional stable-ref od stale-closure bug-a | Dodati one-liner objašnjenje ili refaktorisati sa `useRef`/`useCallback` |

---

## Sekvencijalni redoslijed (zašto ovim redom)

1. **PR-A** prvi — FK pragma fix (A1) eliminiše cijelu klasu importa "uspio" sa silent data loss-om; bez ovoga svi drugi backup fixevi su kozmetika.
2. **PR-B** — najveći stvarni data-loss risk (splitCard, FSRS new-card, fetchSequence race).
3. **PR-C** — EditorView memory leak (C2) je tihi resource leak koji se akumulira tokom sesije.
4. **PR-D** — boot path duplo-handler i recovery race.
5. **PR-E** — sistemski quality gates; treba odvojeno jer mijenja CI semantiku.
6. **PR-F** — cleanup; nizak risk, nezavisno može poslednji.

## Što NIJE preporučeno sada

- Aspirational `DEFERRED` snapshot u export-stream.ts (komentar referencira nepostojeći API) — neka stoji dok ne dođe stvarni zahtjev za cross-table konzistencijom.
- Konsolidacija duplicate platform guard-a (`tryGetExecutor`) — kozmetika, čeka veću refaktor priliku.

## Validacija po PR-u

Svaki PR mora proći puni `bunx vitest run` (613/613 trenutno) **plus** dodati nove testove za root cause koji se popravlja — npr. PR-A dodaje test koji simulira boot bez migracije i tvrdi da `PRAGMA foreign_keys` vraća 1.

Spreman sam krenuti od **PR-A** sa fokusom na A1+A2+A3 u prvoj iteraciji ako odobriš plan.
