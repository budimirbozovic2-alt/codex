# Plan: Analytics + FSRS u Web Worker (Ograničenje #3)

Cilj: skinuti sa main thread-a sve teške `reduce`/`map` petlje (analitika, masteryData, activityData, FSRS batch retrievability) tako da renderovanje dashboard-a za 15k kartica više ne blokira UI. Glavna nit ostaje na 144 FPS, grafici prikazuju skeleton dok worker računa.

## Scope

In:
- `src/lib/analytics/**` (interference, stability, friction, blind-spots, recovery)
- Teški blokovi iz `useStatsData` (`activityData`, `masteryData`, `ratioHistory`, `levelCounts`)
- FSRS batch izračuni koji se zovu samo za analitiku (avg retrievability, future R, `getCardMasteryLevel` po kartici, `getSectionScore` agregacije)
- `useCardAggregates` ostaje na main thread-u (mali, dirty-tracked, koristi se za routing/badge — premalo da bi opravdao serializaciju)

Out (sljedeća iteracija):
- IDB čitanje iz worker-a (sad worker prima snapshote)
- `localStorage` čitanje iz worker-a (main thread serijalizuje `loadCalibration/loadLatency/loadDisciplineLog/loadPlanner` snapshote i šalje uz request)
- FSRS koji se koristi za grading (`calculateNextReview` ostaje sinkron — kritičan path, ne smije biti async)
- Dexie/Repository sloj

## Arhitektura

```text
UI (StatsPage, MyStats, SubjectDiagnosticsPage)
        │
        │ thin hook  ──────────────────────────┐
        ▼                                       │
useAnalyticsWorker()                            │
  • lazy worker singleton                       │ skeleton dok promise pending
  • Comlink.wrap<AnalyticsAPI>                  │
  • request keying (hash deps → cache)          │
  • AbortSignal po pozivu                       │
        │                                       │
        ▼                                       │
analytics.worker.ts (module worker)             │
  ├─ Comlink.expose(api)                        │
  ├─ src/lib/analytics/_pure/**  ◄── moved      │
  ├─ src/lib/sr/_pure/**  (retrievability,      │
  │                       getSectionScore,      │
  │                       getCardMasteryLevel)  │
  └─ chart-aggregators/  (activityData,         │
                          masteryData,          │
                          ratioHistory,         │
                          levelCounts)          │
```

Worker je **stateless**: svaki poziv prima `{ cards, reviewLog, snapshots }` i vraća već agregirane podatke. Glavna nit drži SSOT.

## Inkrementalna isporuka (5 PR-ova, redoslijed)

### PR-1 — Pure split (preparatory, zero behavior change)
Razdvojiti analytics i sr module u `_pure/` granu — bez React, DOM, localStorage, Dexie importa.
- `src/lib/analytics/_pure/interference.ts` — čista funkcija nad `Card[]`
- `src/lib/analytics/_pure/stability.ts` — funkcija prima `{ disciplineLog, planner }` umjesto `loadDisciplineLog()/loadPlanner()`
- `src/lib/analytics/_pure/friction.ts` — prima `latencyLog`
- `src/lib/analytics/_pure/blind-spots.ts` — prima `calibration`; `calcWeakHooks` ostaje na main (piše u IDB)
- `src/lib/analytics/_pure/recovery.ts` — prima `disciplineLog`
- `src/lib/sr/_pure/aggregations.ts` — re-export `getSectionScore`, `getCardMasteryLevel`, retrievability helpers (bez side-effect importa)
- Postojeći fajlovi postaju thin adapteri: čitaju localStorage pa zovu `_pure`.
- ESLint pravilo (`no-restricted-imports`) za `_pure/**` zabranjuje `@/lib/storage`, `localStorage`, `@/contexts/**`, `@/lib/db**`, `react`.

Test: postojeći testovi prolaze nepromijenjeni (samo refactor).

### PR-2 — Worker skeleton + Comlink
- `bun add comlink`
- `src/workers/analytics.worker.ts` — `Comlink.expose({ runInterference, runStability, runFriction, runBlindSpots, runRecovery, buildChartData })`
- `src/lib/analytics/workerClient.ts` — lazy singleton:
  - `new Worker(new URL("../../workers/analytics.worker.ts", import.meta.url), { type: "module" })`
  - `Comlink.wrap<AnalyticsAPI>(worker)`
  - `terminate()` na `beforeunload` (via `taskScheduler` lifecycle)
  - request keying: `hash(cards.length + reviewLog.length + lastReviewTs) → Promise` cache, 30s TTL
- Fallback: u test env (`vitest`) i ako `typeof Worker === "undefined"` → sync poziv `_pure` funkcija.

Test: `src/test/analytics-worker-roundtrip.test.ts` — mockuje Worker, provjerava da Comlink RPC vraća isti rezultat kao sync.

### PR-3 — Chart aggregators u worker
Migrirati teške memo blokove iz `useStatsData`:
- `activityData` (dva puna prolaza kroz `reviewLog` + `cards`)
- `masteryData` (prolaz kroz sve sections × `getSectionScore`)
- `ratioHistory` (već `useDeferredCompute`, ali svejedno na main thread-u; sad worker)
- `levelCounts` (prolaz kroz sve kartice × `getCardMasteryLevel`)
- `categoryChartData` (jeftin, ostaje na main)

Novi hook `useStatsDataAsync` vraća `{ ...sync, charts: ChartBundle | null }`. `MyStats` prikazuje `<TabSkeleton />` dok je `charts === null`.

### PR-4 — Analytics konzumeri (SubjectDiagnosticsPage, OverviewTab, ResistanceTab itd.)
Zamijeniti direktne pozive (`calcInterferencePairs(cards)`) sa:
```ts
const { data: interference } = useWorkerQuery(
  (api) => api.runInterference(cards, { limit: 10 }),
  [cards]
);
```
Tokom pending stanja: `<Skeleton />` umjesto blank UI. Greška u worker-u: ErrorBoundary fallback + telemetry event `ANALYTICS_WORKER_ERROR`.

### PR-5 — FSRS retrievability batch
Pozive tipa `cards.forEach(c => c.sections.forEach(s => ...computeRetrievability(s)))` zamijeniti sa `api.computeRetrievabilityBatch(cards)` koji vraća `Map<sectionId, number>`. Koristi se u `useCardAggregates` *samo* za bucket "critical/risk" prikaza (ne za FSRS grading u review modu).

## Tehnički detalji

**Transfer strategija**
- Šaljemo strukturirano-klonirane plain objekte (ne `Card` instance — već su to plain JSON-like u SSOT-u).
- Velike payload-e (>5MB) razmotriti `transferable` ArrayBuffer + custom binary, ali tek u v2 ako Comlink overhead postane mjerljiv.

**Cancellation**
- Comlink ne podržava nativno abort; implementiramo `requestId`-based gate u worker klijentu: nova request s istim ključem invalidira ranije promise-ove (`.then` postaje no-op kroz `cancelled` flag).

**Worker lifecycle**
- Singleton instanciran lazy na prvi poziv (ne na app boot — ne kvarimo TTI).
- `terminate()` registrovan kroz `taskScheduler.onShutdown()` (postoji per memory `Task Scheduler`).
- HMR: u dev modu `import.meta.hot?.dispose(() => worker.terminate())`.

**Vite/Electron**
- `new Worker(new URL(...), { type: "module" })` — Vite zna bundle-ovati. Electron CSP već dozvoljava `worker-src 'self' blob:` (per memory `Electron Infrastructure v4`).
- Test env: `vitest` koristi happy-dom; fallback grana izvršava sync na main da bi testovi ostali deterministički.

**Telemetry**
- Novi event `ANALYTICS_WORKER_ERROR` u `src/lib/event-bus-types.ts`.
- Mjerenje: `performance.mark("analytics:req")` u klijentu, šaljemo `durationMs` u logger za prve N poziva (dev only).

## Ograničenja / open questions

1. **Storage čitanje**: `loadCalibration/loadLatency/loadDisciplineLog/loadPlanner` u PR-1 ostaju na main thread-u. To znači da svaki request mora serijalizovati i te snapshote (uvijek mali, <1MB ukupno). Alternativa: kasnije migrirati ova tri loga u IDB pa worker čita direktno. Odluka za sad: **main snapshot-uje, šalje uz request**.
2. **`calcWeakHooks`** mutira mnemonic kartice i piše IDB — ostaje na main thread-u u potpunosti (nije OLAP, već write path).
3. **Bundle size**: worker chunk će uvući `date-fns`, dio FSRS-a, sve analytics module. Procjena ~40-60 KB gzip; prihvatljivo jer se učitava lazy.
4. **Da li `useCardAggregates` migrirati?** Preporuka: **ne**. Koristi se za routing badge-ove i mora biti dostupno odmah; trenutno već radi dirty-tracking i je <5ms za 15k kartica. Async overhead bi ga pogoršao.

## Šta NE diramo

- FSRS grading (`calculateNextReview`, `gradeSection`) — sinkron, kritičan path
- Pure UUID taxonomy
- Dexie shema / repositori sloj
- Ref-Delta pattern
- Provider tree, AppContext SSOT
- DM Sans + 6-tema paleta
- Test scheduler primitive

## Acceptance criteria

- [ ] StatsPage open sa 15k kartica: main thread idle gap >50ms ne smije se pojaviti tokom inicijalnog rendera
- [ ] Skeleton vidljiv <16ms od mount-a; pravi grafik <1s na M1 baseline
- [ ] Postojeći analytics testovi prolaze (re-eksportovani `_pure` ekvivalenti)
- [ ] Novi `analytics-worker-roundtrip.test.ts` pokriva svih 5 RPC metoda
- [ ] ESLint guard sprječava direktne importe iz `_pure/**` u storage/db/react module
- [ ] U test env-u nema padova zbog `Worker` undefined (sync fallback)
- [ ] Worker termiranje radi na app close (Electron quit + browser beforeunload)
