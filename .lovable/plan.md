# Deep Audit v2 — Što su flasteri sakrili (i što su flasteri uveli)

Tri paralelne analize (persistence/queue, boot/lifecycle, domains/features) na trenutnom stanju kodbaze (poslije .lovable/plan.md Waves 1–5). **23 nalaza**, sortirano po blast radiusu. Nekoliko nalaza nastalo je upravo iz prethodnih „fix-eva" — pravi root cause nije bio adresiran nego pomjeren.

---

## WAVE A — PROD data loss/corruption koje DEV ne hvata (kritično, ovog momenta)

### A.1 · `runMany` izaziva *nested BEGIN* u svakom PROD backup restore-u **(NOVO — uveo Wave-1.5)**
`src/lib/persistence/sqlite/client.ts:103–112` umata `runMany` u vlastiti `BEGIN/COMMIT`. Ali svih **14 pozivnih mjesta** `tx.runMany(...)` (`write-cards-tx.ts:63`, `write-categories-tx.ts:43,59,74,90,116`, `write-satellite-tx.ts:151,169,201,207,228,235,242,253,260`) izvršava se **unutar** otvorenog `exec.transaction(async tx => …)` u `import-transaction.ts:93`. SQLite → `cannot start a transaction within a transaction` → cijeli restore rollback.

Maskirano u DEV-u jer `dev-fallback.ts:runMany` nema interni BEGIN. Postojeći `backup-import-rollback.test.ts` koristi DEV harness, pa zeleno.

**Fix:** ukloniti `BEGIN/COMMIT` iz `runMany` (ili zamijeniti `SAVEPOINT`-om sa `_inTransaction` guard-om). Sve atomic write paths već su umotane u `exec.transaction()` od strane pozivaoca. Dodati PROD-path test koji pokriva nested poziv (in-memory `oo1.DB`).

### A.2 · `categoryRepository.commit` — rollback target i dalje racuje sa konkurentnim commitom **(Wave-1.2 nedovršen)**
`src/lib/repositories/categoryRepository.ts:65–77`. `preOptimistic` i `setCategoryStoreRecords(optimistic)` se izvršavaju **prije** mutexa. Za commit A→B i commit B→C koji stignu u istom tick-u: kad A padne, `rollbackTo` unutar mutexa već je C (commit B-a). Guard `rollbackTo === optimistic` je false → store ostaje na C umjesto da se vrati na A.

**Fix:** premjestiti i `preOptimistic` snapshot i optimistic write **unutar** `_saveMutex.runExclusive` callback-a (kratko zadržavanje renderom kompenzovati Suspense-om/transitionom, ne ostavljati ga "optimistički" da bi se izbjegao mutex).

### A.3 · `persist-queue` MAX_RETRY exhausted → stranded items dok korisnik ručno ne piše opet **(flaster Wave-3.1 ostavio rupu)**
`src/lib/persist-queue.ts:183–196`. Nakon `MAX_RETRY` reset-uje `_retryAttempt = 0`, prikaže "HITNO eksportujte backup" toast, ali ne armira novi timer. Re-enqueueovani entries sjede u `pendingPuts/pendingDeletes`; flush startuje samo ako sljedeći `schedule()` dođe — što kod tihog session-a (korisnik samo čita) ne dolazi. Reload = trajni gubitak.

**Fix:** nakon max-retry toast-a, ili armirati jedan dugi follow-up retry (`setTimeout(flush, 30_000)`), ili zvati `cleanup({strict:true})` koja će propustiti grešku gore i otključati Emergency Export modal.

### A.4 · `reviewLogRepository._drain` retry re-enqueueuje ali nikad ne reschedulea
`src/lib/repositories/reviewLogRepository.ts:16–26`. Catch baci natrag u `_queue` i throw-uje; `void _drain()` poziv u `setTimeout` baci promise u prazno. Sljedeći flush dolazi tek na sljedeći `append()` ili eksplicitni `flush()` (quit/backup).

**Fix:** pozvati `_schedule()` prije `throw err` u catch-u.

### A.5 · `import-transaction.ts:75–84` — legacy taxonomy resolve fail = tihe broken FK reference
Catch logguje warning ali `merged` ide u ACID write sa potencijalno null/stale `categoryId/subcategoryId`. FK constraint može ili ne mora uhvatiti (zavisi od podatka). Korisnik vidi "Restore uspešan".

**Fix:** uslovni re-throw ako `legacyResolveReport.mutated > 0 && failed > 0`; pre-validate ref konzistentnosti prije `tx.runMany(CARD_INSERT_SQL, …)`.

---

## WAVE B — Boot/lifecycle flasteri koji još uvijek nose vodu

### B.1 · `withTimeout` guta svaku rejection task-a, ne samo timeout
`src/hooks/card-bootstrap/withTimeout.ts:15–18`. `catch` vraća `fallback` na **bilo koju** grešku. `runSchema.ts:53` outer try/catch koji bi re-throw-ovao kao `SchemaError` se nikad ne aktivira — migracija pada, `withTimeout` vrati `undefined`, boot ide naprijed kao da je sve OK. Wave-2.6 je tražio `{value, timedOut}` shape; nije implementiran.

**Fix:** races samo protiv `Promise.race([fn(), timeoutReject()])`; ukloniti outer catch, pustiti rejection da propagira; pozivalac sam interpretira AbortError.

### B.2 · `AppBootstrap` se može remount-ati i ponovo pokrenuti cijeli DAG
`src/contexts/AppContext.tsx:71`. `<AppBootstrap />` je unutar `<RecoveryGate>` koji conditionally rendera djecu. Ako `dbError` blesne i nestane (recovery panel zatvoren), `AppBootstrap` se unmount → mount, `initialLoadDone.current` je `false` u novom instance-u, kompletan `bootDb → runSchema → loadInitialData` se izvršava drugi put preko `ready` state machine-a.

**Fix:** premjestiti `<AppBootstrap />` **iznad** `<RecoveryGate>` (ili u stable ancestor); `initialLoadDone` može biti modul-level ref jer ionako želi single-shot semantiku po procesu.

### B.3 · `runHeal` fire-and-forget `bulkPut`
`src/hooks/card-bootstrap/runHeal.ts:78` zove `cardMapWrites.bulkPut(mutatedCards)` bez `await`. Ako Electron `beforeunload` lupne odmah nakon heal-a (npr. korisnik zatvori prozor), frequency-tag migracija nestane jer `persistQueue` nije imala vremena da flush-uje.

**Fix:** `await cardMapWrites.bulkPut(…)`; deferred grana već ima broad catch.

### B.4 · `taskScheduler.shutdown` listener registrovan **nakon** `render()`
`src/main.tsx:154` poziva `render(<App />)` a tek na `:170–171` se učita `taskScheduler` i registruje `beforeunload`. Postoji async gap od nekoliko microtask-ova u kojima React 18 može schedule-ovati write u SQLite a `beforeunload` ga ne flush-uje.

**Fix:** pomjeriti `taskScheduler` import u sinhroni dio prije `render()`, ili registrovati `beforeunload` placeholder odmah pa zamijeniti handler kad scheduler stigne.

### B.5 · `useCardBootstrap.ts:144` — `cause` je `"unknown"` const **(Wave-2.1 ostavila zombije)**
Dead ternary je obrisan ali `const cause: "unknown" | "timeout" = "unknown"` je sada bukvalno konstanta. Recovery UI nema nikakvu razliku između timeout-a i schema fail-a (detail string ima `error.step`, ali `cause` field koji UI grana koristi je beskoristan).

**Fix:** `const cause: "unknown" | "timeout" = error instanceof TimeoutError ? "timeout" : "unknown";` ili izbaciti polje i koristiti samo `detail`.

### B.6 · Splash bridge HMR breakage između `bootStateMachine` i `splashBridge`
`src/lib/boot/bootStateMachine.ts:60` i `src/lib/boot/splashBridge.ts:18` imaju nezavisne modul-level `_state` i `_installed` flag-ove. Vite HMR replace-uje module nezavisno; jedan reset bez drugog → DOM bridge mrtav za ostatak session-a (dev-only ali pravi false-positive bug reportove).

**Fix:** `import.meta.hot?.dispose(() => { _installed = false; _state = {type:"idle"}; _listeners.clear(); })` u oba modula.

### B.7 · Splash double-paint — direktni `splashProgress()` + bridge subscriber
`src/hooks/card-bootstrap/bootDb.ts:21`, `runSchema.ts:50,70` rade direktan `splashProgress(...)` poziv pored toga što `splashBridge` već reaguje na transitions. Svaki update piše DOM dvaput.

**Fix:** ukloniti direktne pozive; bridge je single source of truth.

---

## WAVE C — Flasteri koji više nemaju razlog postojanja

### C.1 · `useSourceMutations` onSuccess safety-net invalidations **(Wave-3.5 ostavio flaster)**
`src/hooks/source/useSourceMutations.ts:58–63,86–89`. Komentar `Safety net: ako _notify() → bridge invalidacija propusti window` — root cause (HMR singleton bug) je popravljen u `bridges.ts:218` (`import.meta.hot.dispose(_resetBridgesForTest)`). Flaster sad samo izaziva *double invalidation* na svaki source save (refetch + onPlannerChanged refetch).

**Fix:** ukloniti oba `onSuccess` bloka; verifikovati testom da `_notify()` osvjetla query bez safety-net-a.

### C.2 · Module-level listener `catch {}` u SSOT storage modulima
- `src/lib/mindmap-storage.ts:26`
- `src/domains/planner/cache.ts:44`
- `src/features/mnemonic/mnemonic-storage/cards-repo.ts:51`

Svi swallow-uju exception subscribere-a → bug u UI subscriber-u nestane bez traga. Trebalo bi *isti* pattern kao `persist-queue.ts:62`: `logger.warn("[modul] listener threw", e)`.

### C.3 · Mnemonic write paths swallow-uju greške bez WriteResult-a
`src/features/mnemonic/mnemonic-storage/cards-repo.ts:59` (`saveMnemonicCards`) i `test-log.ts:26` (`addMnemonicTestEntry`) loguju ali ne re-throw-uju. UI nastavi kao da je save uspio.

**Fix:** vratiti `WriteResult<void>` ili re-throw + `toast.error`; pozivaoci (`calcWeakHooks`, test runner) treba da reaguju.

### C.4 · `useNotificationScheduler.ts:34` i `zip-service.ts` koriste raw `setInterval/setTimeout`
Mimoilaze `taskScheduler` shutdown contract — interval ne umire na quit/HMR.

**Fix:** `taskScheduler.setInterval(...)` / `taskScheduler.setTimeout(...)` sa labelom.

---

## WAVE D — Performance & memory leaks

### D.1 · O(n²) u `plan-generator.ts:22–58`
`config.subjectOrder.map(id => categoryRecords.find(...))` + ugniježdeni `subs.find(s => s.id === subId)` po kartici. Pokreće se na svaki planner render za korisnike sa 9+ kategorija × 100+ kartica.

**Fix:** pre-build `Map<categoryId, CategoryRecord>` i `Map<subId, Subcategory>` jednom prije petlje.

### D.2 · O(n²) u mnemonic weak-hooks
`src/domains/mnemonic/analytics/weak-hooks.ts:26`: `latencyLog.filter(l => l.cardId === mc.originalCardId)` unutar `mnemonicCards.forEach`. Sa N mnemonika × M log entry-ja.

**Fix:** pre-group `latencyLog` u `Map<cardId, LogEntry[]>`.

### D.3 · Unbounded caches u `backlink-index/snapshot-cache.ts`
`snapshotCache` (L15) i `pausedCache` (L33) module-level Map-ovi bez evictiona; rastu sve dok app live. Subject sa 500 članaka × 50 backlinkova = 25k entries.

**Fix:** LRU cap (npr. 500) ili prune na `backlinkIndex.clear(subjectId)`.

### D.4 · Duplikat SSOT — `_plannerCache` modul-level vs TanStack
`src/domains/planner/cache.ts` drži `_plannerCache` paralelno sa TanStack `planner` query-jem. `savePlanner` upisuje u cache i potom emituje `onPlannerChanged` → bridge invalidira TanStack. Postoji prozor u kome `loadPlanner()` (sync, čita modul cache) i `useQuery` (čita TanStack data) divergiraju.

**Fix:** ukloniti modul-level cache; sve čitati kroz TanStack `useQuery` (isti pattern koji je primijenjen na mindmap-storage poslije A1c-2).

### D.5 · `EditorView.tsx:36–39` — `useEffect([doc, editor])` poziva `setContent` na svaku promjenu reference parent-a
ProseMirror redundantno resetuje state na svaki render parent-a iako `doc.content` može biti identičan.

**Fix:** komparativni guard (`useMemo(() => doc.content, [serialized])`) ili shallow-equal prije `setContent`.

---

## WAVE E — Korelacije podataka koje će vremenom puknuti

### E.1 · `MnemonicCard.sections[].content` je još raw HTML string
`src/features/mnemonic/mnemonic-storage/types.ts:12` + `card-factory.ts:31,62`. Cijeli system je prešao na `contentDoc: EditorDoc` SSOT (`htmlContent` i `content` su `@deprecated` na main `Card.sections`), ali mnemonic kartice i dalje pišu raw string. Drugi SSOT za strukturno identičan koncept.

**Fix:** dodati `contentDoc?: EditorDoc` na `MnemonicCard.sections`, migrirati write path; ostaviti `content` čitljiv za jedan release pa obrisati.

### E.2 · `resolve-legacy-taxonomy.ts:87–92` — bidirekcioni substring match
`x.norm.includes(v) || v.includes(x.norm)`. Vrijednost `"1"` ili `"djelo"` pogađa više subcategory imena → tih dodjelu pogrešnog UUID-a.

**Fix:** zahtijevati `min length 4` za substring fallback; log ambiguous matches i prikazati u `legacyResolveReport`.

### E.3 · `editor-v4/migrate.ts:44–46` — naivni inline-bold regex
`\*\*([^*]+)\*\*` pada na ugniježdeni `**bold *italic* bold**` (unutrašnji `*` zaustavlja `[^*]+`). Tiho gubi outer bold.

**Fix:** `(?:[^*]|\*(?!\*))+` ili pravi inline parser.

### E.4 · `planner cache.ts:81–83` — `decades → phases` migracija bez verzioniranja
Sniff po runtime ključu (`'decades' in parsed && !('phases' in parsed)`). Bilo koja buduća verzija sa `decades` poljem reaktivira migraciju.

**Fix:** dodati eksplicitni `configVersion: number` u `PlannerConfig`.

---

## WAVE F — Dead code & dead parameters

- `src/domains/planner/suggestions.ts:71` — `velocity` parametar prima i odmah `void velocity;` → ukloniti.
- `src/domains/planner/discipline.ts:51` — `dailyGoal` parametar isti pattern.
- `src/lib/migrations/remap-from-backup.ts:258` — `oldCatNameById` izgrađen u `:132`, nikad korišten osim `void` supresora.
- `src/lib/editor-v4/lazy-migrate.ts:121–124` — `void saveArticle` tree-shake supresija sa komentarom "future PRs will swap".

---

## Redoslijed implementacije i validacija

1. **Wave A** odmah, ovog ciklusa. A.1 blokira svaki PROD restore — bez fix-a ne smije biti release. Dodati PROD-path integration test (in-memory `oo1.DB` umjesto `dev-fallback`).
2. **Wave B** sljedeće. B.1+B.2 su tihi gubitak boot signala; B.3+B.4 mogu izgubiti malu količinu podataka na quit.
3. **Wave C** može u istom PR-u sa B (uglavnom subtraktivno, niskorizično).
4. **Wave D** posebno; D.4 (planner SSOT) je najveći diff.
5. **Wave E** zahtijeva migracioni plan (E.1 mijenja schema-stable polje).
6. **Wave F** cleanup PR.

Za svaki wave: vitest pass + jedan e2e prolaz (cold boot + bulk import + reload + backup export/import).

---

## Tehnički detalji

- A.1 je *uzročno-posljedični* nalaz: Wave-1.5 je dobro identifikovao da `runMany` nema atomicnost kad se zove standalone, ali je fix proširio scope umjesto da se ograniči na "wrap only when not already in transaction". Pravi root cause je da `runMany` semantika nije bila definisana — *koja vrsta atomicnosti se očekuje*. Treba odlučiti: a) `runMany` je *uvijek* atomic (mora znati o nested kontekstu — `_inTransaction` flag na `wrapDb`), ili b) `runMany` je *nikad* atomic (pozivalac bira). Preporučujem b) jer svi trenutni call-siti već imaju vanjski `transaction()`.
- A.2 je klasičan TOCTOU; ispravan fix je premjestiti **cijeli** "compute optimistic + apply + persist" unutar mutexa. Latencija prozora je <1ms za tipičan workload (≤9 kategorija) — vrijedna cijena za garanciju.
- C.1 testabilno: dodati vitest koji mockuje `bridges.onSourcesChanged`, fire-uje `saveSource`, očekuje **jednu** `invalidateQueries(['sources'])`, ne dvije.
- E.1 backup forward-kompatibilnost: backup schema treba primati i `content` i `contentDoc` na mnemonic section nivou; export piše samo `contentDoc`.

Plan je opisno potpun. Nakon vašeg odobrenja prelazim na build mode i počinjem od Wave A.1.

---

## Status — Deep Audit v2 implementation

**Wave A** ✅ runMany BEGIN/COMMIT removed (A.1) · categoryRepository mutex hardened (A.2) · persist-queue MAX_RETRY rescue timer (A.3) · reviewLogRepository reschedule on retry (A.4) · resolveLegacyTaxonomyNames propagates errors (A.5).

**Wave B** ✅ withTimeout no longer swallows task rejections (B.1) · AppBootstrap above RecoveryGate (B.2) · runHeal awaits bulkPut + persistQueue.flush (B.3) · taskScheduler beforeunload registered before render (B.4) · cause field corrected (B.5) · HMR dispose for bootStateMachine + splashBridge (B.6) · removed direct splashProgress (B.7).

**Wave C** ✅ Source-mutation safety-net invalidations removed (C.1) · module-level listener catches log via logger.warn (C.2) · mnemonic write paths re-throw on failure (C.3) · useNotificationScheduler routes through taskScheduler (C.4).

**Wave D** ✅ plan-generator pre-builds cards-by-cat + sub maps (D.1) · weak-hooks pre-groups latencyLog (D.2) · backlink snapshot caches bounded LRU(500) (D.3). ⏳ Deferred: D.4 planner cache SSOT, D.5 EditorView setContent guard.

**Wave E** ✅ resolve-legacy-taxonomy substring requires min length 4 + reports ambiguousMatches (E.2) · editor-v4 inline-bold regex tolerates nested `*…*` (E.3) · PlannerConfig.configVersion gates decades→phases migration (E.4). ⏳ Deferred: E.1 MnemonicCard.sections.contentDoc (schema change, separate PR).

**Wave F** ✅ remap-from-backup oldCatNameById removed (F.3) · lazy-migrate `void saveArticle` + dead import removed (F.4). ⏳ Deferred: F.1/F.2 planner dead params (keeps signature stable for 5 callers; ROI low).

Test suite: 613/613 passing.
