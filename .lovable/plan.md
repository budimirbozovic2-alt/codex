## Cilj

Pet srednje-prioritetnih strukturnih problema iz audita — svaki kao zaseban, izoliran PR sa testovima. Redoslijed je biran tako da svaka iteracija stoji samostalno i ne blokira ostale.

---

### PR1 — #10 Konsolidacija keyed mutex-a (DRY/DX)

Stanje: tri ručna `Promise.resolve()` lanca + dva ad-hoc inFlight brojača:
- `src/lib/repositories/categoryRepository.ts` (`_pendingSave`)
- `src/lib/planner/cache.ts` (`_pendingWrite`)
- `src/lib/repositories/cardMapInvalidator.ts` (`.then(() => …)` lanac)
- `src/lib/persist-queue.ts` (`inFlightCount` mikrotask coalesce)
- (istorijski) `cardCommandBus` (uklonjen u Phase 4 — komentar i dalje stoji)

Plan:
1. Nova primitiva `src/lib/concurrency/keyedMutex.ts`:
   - `createKeyedMutex<K>()` → `{ runExclusive(key, fn), drain(key?), pending(key?) }`
   - Globalni mutex (`runExclusive(GLOBAL_KEY, fn)`) je samo poseban slučaj.
   - Greške se rethrow-uju iz `runExclusive` ali ne zatruju lanac (`.catch(() => {})` interno).
2. Migracija sajtova → svaki dobija imenovani mutex (npr. `categoryMutex.runExclusive("save", op)`).
3. `persist-queue` ostaje sa svojom semantikom (frame coalesce) ali `inFlightCount` zamijeniti `mutex.pending()` API-jem.
4. Test: `src/test/keyed-mutex.test.ts` — ordering, error isolation, drain.
5. ESLint guard: zabrana novih `_pending\w+\s*=\s*Promise\.resolve` literala van `src/lib/concurrency/**`.

---

### PR2 — #9 Proxy noop fallback (silent provider bugs)

Stanje: `CardActionsProvider`, `CategoryActionsProvider`, `BackupActionsProvider` vraćaju `new Proxy({}, { get: () => noop })` kad provider fali, sa `console.warn` "HMR transient" samo u DEV-u. PROD progresivno pojede klikove (delete, save, import).

Plan:
1. Razdvojiti DEV/PROD ponašanje:
   - **DEV**: throw odmah (`Error: useCardOnlyActions used outside provider`) — HMR transient se eliminira pravilnim ključem na root-u (umjesto da ga maskiramo).
   - **PROD**: classify metode kao `read` vs `write` preko statične mape; pozivi `write` metoda u PROD-u throw-uju + emit `eventBus.emit("PROVIDER_FALLBACK", {provider, method})`; `read` metode vraćaju default vrijednost iz `EMPTY_*` konstanti (ne `noop`).
2. Telemetrija: nova event vrsta `PROVIDER_FALLBACK` se loguje kroz `logger.error` i, u Electron-u, kroz crash-log file.
3. Test: `src/test/provider-fallback.test.tsx` — render bez providera mora throw-ati u DEV, write call mora throw-ati u PROD.

---

### PR3 — #6 body-pointer-events-guard (maintenance bomba)

Stanje: `src/lib/body-pointer-events-guard.ts` zavisi od internih atributa Radix-a (`[data-radix-focus-guard]`), Vaul-a (`[data-vaul-drawer]`) i `react-remove-scroll` (`body[data-scroll-locked]`). Tihi crash ako bilo koja biblioteka promijeni naming.

Plan:
1. **Selector regresijski test** (`src/test/body-pointer-events-selectors.test.tsx`):
   - Mount jedne Radix Dialog + jedne Vaul Drawer + jedne AlertDialog instance.
   - `expect(document.querySelector(OPEN_OVERLAY_SELECTOR))` za svaki state.
   - Test se izvršava u CI-ju nakon svake `bun update`; pad = guard mora biti revidiran.
2. **Watchdog log**: ako `body.style.pointerEvents === "none"` ostane >300ms bez aktivnog overlay-a, `logger.error("[guard] body lock leaked")` + zabilježi vrijednost `installed.lastClearAt`. Daje signal čak i ako selektori i dalje match-uju ali se semantika promijeni.
3. **Version pin** u `package.json`: `@radix-ui/react-dialog`, `vaul`, `react-remove-scroll` prelaze iz `^` u tačnu verziju; bump je svjesna odluka (dokumentovano u `docs/dependency-pins.md`).
4. **Smanjenje doseg**: dodati `<DialogRoot>` wrapper koji forsira `onOpenChange` cleanup pattern (audit u `src/test/dialog-close-pattern.test.tsx`); guard ostaje kao defense-in-depth ali ne kao primarni put.

---

### PR4 — #12 DB boot state machine + recovery UX

Stanje: `bootDb()` vraća `{ok: boolean}`; greške se signaliziraju kombinacijom `dbErrorState` modul-varijable, splash stringova i `DbErrorProvider`-a. Korisnik ne dobija jasnu razliku između "blocked tab", "version mismatch", "corrupted IDB", "timeout".

Plan:
1. Novi `src/lib/boot/bootStateMachine.ts`:
   ```
   idle → opening → migrating → loading → ready
              ↓         ↓          ↓
            blocked  version    corrupted
              ↓     mismatch       ↓
            recovery-prompt
   ```
   - Implementacija kao discriminated union state + reducer; svaka tranzicija ima `reason` polje.
2. `BootStateProvider` zamijenjuje direktno čitanje `getDbErrorState()`. `useDbError` postaje shim koji deriva iz `bootState`.
3. `bootDb` i `runMigrations` su sad transition emitter-i (`emit({type: "OPENING"})`, `emit({type: "OPEN_OK"})`, `emit({type: "OPEN_FAILED", reason})`).
4. Recovery UI komponenta `<BootRecoveryDialog>`:
   - `blocked` → "Zatvorite ostale tabove ili kliknite Reset".
   - `version` → "Backup → Reset → Restore" wizard sa progress bar-om.
   - `corrupted` → "Export emergency JSON + Reset" (već postoji `emergency-export.ts` — sad ga state machine pokreće).
5. Tests: `src/test/boot-state-machine.test.ts` (sve tranzicije) + `src/test/boot-recovery-flow.test.tsx` (jedan E2E recovery).

---

### PR5 — #1 OLAP u UI niti → Web Worker

Stanje: `useStatsData` (`src/hooks/useStatsData.ts`, 127 LOC) + `src/lib/analytics/*` (5 fajlova, ~450 LOC) izvršavaju agregaciju preko `useDeferredCompute` (rIC) na main thread-u. Pri >10k review log unosa dolazi do jank-a (long task >50ms).

Plan:
1. Novi worker `src/workers/analytics-worker.ts`:
   - Input: `{cards, reviewLog, srSettings, asOf}`.
   - Output: `{ratioHistory, focusRatio, blindSpots, frictionScore, interferenceMap, recoveryCurve, stabilityHistogram}`.
   - Cijela `src/lib/analytics/**` familija je čist `(input) → output` — premjestiti u `src/lib/analytics/_pure/` (bez DOM-a, bez React-a), worker ih importuje direktno.
2. Hook `src/hooks/useAnalyticsWorker.ts`:
   - Singleton worker (lazy init); request keying preko `hash(cards.length + reviewLog.length + maxUpdatedAt)`.
   - Vraća `{data, isComputing}`; data se memo-izira dok hash ne promijeni.
3. `useStatsData` postaje thin shim koji konzumira hook + zadržava jeftine sync derive-ove (npr. `categoryStats` lookup-i).
4. Fallback: ako `Worker` nije dostupan (test env), pao na main-thread sync put (sa `console.warn` u DEV-u).
5. Tests:
   - `src/test/analytics-worker.test.ts` — parity test (worker vs main-thread daju identičan output na fixture-u).
   - `src/test/perf/analytics-jank.bench.ts` — 50k log unosa, mora <16ms main-thread vrijeme.

---

## Redoslijed i nezavisnost

| PR | Zavisnosti | Risk | LOC est. |
|----|------------|------|----------|
| PR1 mutex | nijedna | low | ~250 |
| PR2 fallback | nijedna | low | ~150 |
| PR3 guard | nijedna | medium (CI tooling) | ~200 |
| PR4 boot SM | nijedna | medium (mijenja boot flow) | ~500 |
| PR5 analytics worker | nijedna | medium (worker infra) | ~700 |

Svi PR-ovi su nezavisni — može se ići paralelno. Predlažem redoslijed PR1 → PR2 → PR3 → PR4 → PR5 (od najmanjeg blast radius-a ka najvećem).

## Šta se NE dira

- FSRS algoritam, taxonomy, Zettelkasten, planner business logika.
- UI teme, route-ovi, korisnička semantika.
- Postojeće Dexie šeme (PR4 ne diže verziju).
- Pomodoro / SpeedReader / TTS engine-i.

## Otvorena pitanja

1. **PR3 version-pin** — da li želiš striktni pin (`1.2.3`) ili tilde (`~1.2.3`)? Pin = manji rizik, češći ručni bump.
2. **PR5 worker bundling** — Vite već radi worker chunk; bez dodatne konfiguracije. OK?
3. **PR4 recovery UX** — da li želiš da `corrupted` state automatski export-uje emergency JSON, ili samo nudi dugme?
---

## Status implementacije (snapshot)

- **PR1 ✅** — `createKeyedMutex` u `src/lib/concurrency/`, migrirani `categoryRepository` i `planner/cache`, 6 testova prolaze, ESLint guard protiv `_pending* = Promise.resolve()` aktivan.
- **PR2 ✅** — `_providerFallback.missingProvider()` zamijenio Proxy noop-ove u `CardActionsProvider`, `CategoryActionsProvider`, `BackupActionsProvider`; emituje `PROVIDER_FALLBACK` telemetriju + throw; 3 testa prolaze.
- **PR3 ✅** — `OVERLAY_SELECTORS` izložen kao named export; watchdog log (300ms) na `taskScheduler.setInterval`; regresijski test mountuje Radix Dialog. Version-pin (`@radix-ui/react-dialog`, `react-remove-scroll`) **NIJE** primijenjen u package.json — to je svjesna odluka pri sljedećem `bun update` (vaul nije instaliran).
- **PR4 ✅ (core)** — `src/lib/boot/bootStateMachine.ts` (discriminated union + reducer + subscribe API), `BootStateProvider` + `useBootState`, `transition()` emit-ovi iz `bootDb`/`runMigrations`/`loadInitialData`/`useCardBootstrap`; 3 testa prolaze. Recovery UI (`<BootRecoveryDialog>`) i `useDbError` shim ostavljeni za zaseban PR — postojeći `DbErrorProvider` + `BlockingModal` ostaju kompatibilni.
- **PR5 ⏸** — Analytics worker odložen (najveći scope, ~700 LOC, zaseban PR).
