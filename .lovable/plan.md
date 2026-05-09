## Cilj

Razbiti monolitnu IIFE u `src/hooks/useCardBootstrap.ts` (~270 LOC) na jasno imenovane faze. Bez promjene ponašanja, redoslijeda, timeout-a, splash UI poruka, ni javnog API-ja hook-a.

## Nova struktura

Novi folder `src/hooks/card-bootstrap/` sa file-private fazama:

```text
src/hooks/card-bootstrap/
  splash.ts              // splashProgress, showSplashError, cleanupSplash, notifyReady
  withTimeout.ts         // postojeći helper iznesen iz useCardBootstrap
  bootDb.ts              // ensureDbOpen + getDbErrorState; vraća { ok, errored }
  runMigrations.ts       // migrateFromLocalStorage + mnemonics + healCardTaxonomy
  loadInitialData.ts     // initCaches + paralelno idbLoad* + frequency tag migracija
  normalizeCategories.ts // legacy string→SubcategoryNode, fallback nodes, phantom prune, persist
src/hooks/useCardBootstrap.ts  // slim orchestrator (~70 LOC)
```

## Detalji faza

**`splash.ts`** — sve `document.getElementById("splash-*")` DOM operacije (progress bar, status, error, cleanup sa fade, `electronAPI.notifyReady`). Čisto presentational.

**`bootDb({ panicSetReady })`** — poziva `ensureDbOpen(6000)`, `markBootStep`, `scheduleLogPrune`. Vraća `{ ok: boolean }`. Ako pukne, splash poruka i `showSplashError` se postavljaju ovdje.

**`runMigrations()`** — tri postojeća `withTimeout` poziva (LS migration, mnemonics, taxonomy heal) + `checkInterruptedFlush`. Vraća `void`.

**`loadInitialData()`** — `initCaches` (Promise.all 3 init-a) + paralelni `idbLoad*` blok + frequency tag migracija + splashProgress(60). Vraća `{ cards, catRecords, log, settings }`.

**`normalizeCategories({ cards, catRecords })`** — sva logika gradnje `cardsByCat` indeksa, legacy `string[]` → `SubcategoryNode[]` migracija sa `stableLegacyId`, fallback nodes za orphan kartice, phantom UUID prune, fire-and-forget IDB persist. Vraća `{ finalRecords }`.

**`useCardBootstrap` (slim)** — drži `useState(ready)`, panic timer, te `useEffect` koji sekvencijalno zove faze i na kraju setuje state (cardMapRef, setCardMapState, bumpMapVersion, setCategoryRecordsState, setReviewLogState, setSrSettingsState) + `splashProgress(100)` + `finally` blok (setReady, clearTimeout, splash cleanup, notifyReady).

## Garancije

- Identičan redoslijed `markBootStep` poziva i splash progress tačaka (5/10/15/25/60/85/100).
- Iste `withTimeout` vrijednosti i fallback vrijednosti.
- Iste DEV `console.log` poruke.
- Setteri se zovu tačno jednom, na kraju, kao i sad.
- Panic timer (8s) i `finally` blok ostaju u hook-u (jer trebaju `setReady`).
- Eksterni API (`useCardBootstrap(setters)` → `{ ready }`) nepromijenjen.

## Verifikacija

- TypeScript build (auto).
- Ručna provjera boot-a u preview-u: splash prolazi kroz iste tačke; nema duplog mount-a (`initialLoadDone.current` ostaje).

## Procjena

B → A−. Glavni fajl: ~270 LOC → ~70 LOC. Svaka faza ima jednu odgovornost i može se zasebno čitati/testirati.
