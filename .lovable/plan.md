## PR-7f M1 — TanStack Query read-path adoption (sources + planner)

Cilj: uvesti **jedan** read-cache (`QueryClient`) iznad postojećih SSOT storage modula, počev od `sources-storage` i `planner/*`. Bez diranja write-path-a (mutacije ostaju sinhrone Ref-Delta + `enqueueWrite`). Bez ukidanja postojećih event-listenera — oni postaju **most za invalidaciju**, ne paralelni transport.

### Scope

In:
- `@tanstack/react-query` instalacija + `QueryClientProvider` u `App.tsx`.
- `src/lib/query/keys.ts` (typed `queryKeys` barrel).
- `src/lib/query/bridges.ts` (jedan `useEffect`-free modul-level setup koji mapira postojeće SSOT eventove → `queryClient.invalidateQueries`).
- Refaktor `useCategorySources` / `useAllSources` na `useQuery`.
- Refaktor `usePlannerData` na `useQuery` po segmentu (velocity, subjectPlans, disciplineLog, disciplineTrend, burnup, projectionText, retentionRisk, smartSuggestion, timeRec, phaseDisciplinePct, streaks).
- Bridge: `onSourcesChanged` → invalidate `['sources']`; novi `onPlannerChanged` event u `planner/cache.ts` setterima → invalidate `['planner', …]`.

Out (P2/P3, posebni PR-ovi):
- Konverzija write-path-a na `useMutation` (PR-7f M4+).
- Cards/MindMaps/Backlink read-path (PR-7g).
- Promjena postojećih write-API potpisa (sync ostaje sync).

### Arhitektura

```text
Component
   │ useQuery(queryKeys.x)
   ▼
TanStack QueryClient ──── invalidate ◀─── bridges.ts
   │ queryFn                                     ▲
   ▼                                              │
sources-storage.ts / planner/*  ──── onChange ───┘
   │ Dexie
   ▼
IndexedDB
```

- `QueryClient` config: `staleTime: Infinity`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`. Razlog: SSOT je već u RAM-u (Dexie + module cache), invalidacija je eksplicitna preko bridge-eva. Nema potrebe za time-based refetch.
- `queryFn` čisto delegira na postojeće `load*` funkcije — nema duplikata logike.
- `placeholderData` koristi sinhrone cache gettere (`disciplineCache.get()`, `_cache` u sources-storage) gdje su dostupni → 0 flicker-a pri prvom mount-u.

### Query keys (predlog)

```ts
queryKeys.sources.all()                        // ['sources']
queryKeys.sources.byCategory(catId)            // ['sources', 'cat', catId]
queryKeys.planner.config()                     // ['planner', 'config']
queryKeys.planner.disciplineLog()              // ['planner', 'discipline', 'log']
queryKeys.planner.disciplineTrend(days)        // ['planner', 'discipline', 'trend', days]
queryKeys.planner.velocity(reviewLogHash, n)   // ['planner', 'velocity', hash, n]
queryKeys.planner.subjectPlans(configHash, …)  // ['planner', 'plans', …]
queryKeys.planner.burnup(…)                    // ['planner', 'burnup', …]
queryKeys.planner.retentionRisk(catIds, goal)  // ['planner', 'retention', …]
```

### Konkretni koraci

1. **Instalacija**: `bun add @tanstack/react-query`.
2. **Provider mount**: `App.tsx` zamotava root sa `<QueryClientProvider client={queryClient}>`; `queryClient` instanca singleton u `src/lib/query/client.ts`.
3. **Bridges**:
   - `onSourcesChanged(() => queryClient.invalidateQueries({ queryKey: ['sources'] }))`.
   - U `planner/cache.ts` dodati lagani emitter (`plannerListeners`); svaki `*Cache.set` zove `_notify(key)`; bridge mapira: `'planner-config' → ['planner','config']`, `'discipline' → ['planner','discipline']`, itd.
   - Bridge se inicijalizuje jednom u `client.ts` modul-level (no React lifecycle dependency).
4. **`useCategorySources` / `useAllSources`** → `useQuery({ queryKey: queryKeys.sources.byCategory(catId), queryFn: () => loadSourcesByCategory(catId), enabled: !!catId })`. Stari signatura ostaje (returna `Source[]`) — call-site-ovi se ne mijenjaju.
5. **`usePlannerData`** dekompozicija:
   - Sinkroni segmenti (`config`, `disciplineLog` koji je već sync getter) → `useQuery` sa `placeholderData` iz sync cache-a, `queryFn` returna isti cache (omogućuje invalidaciju bez re-readinga IDB-a).
   - Async segmenti (velocity, subjectPlans, burnup, retentionRisk, projectionText, smartSuggestion, timeRec) → `useQuery` direktno, sa `queryFn` koji await-uje `getPlannerModule()` pa zove postojeću pure funkciju. Skida se `useDeferredCompute` u ovim slotovima (TanStack već dedupe-uje + serijalizuje po key-u).
   - `save` ostaje sync (`setConfig` lokalno) + `mod.savePlanner` (Ref-Delta) — bridge invalidira relevantne planner ključeve.
6. **Stabilni keyevi**: `reviewLog` i `cards` dependency-i koji su do sada bili object identity → zamijeniti laganim hash-em (npr. `reviewLog.length + ':' + lastTimestamp`, `cards.length + ':' + lastUpdated`) da TanStack key bude stabilan kroz re-render. Hashing utility u `src/lib/query/hash.ts`.
7. **Test**: dodati `src/test/query-bridges.test.ts` — mock `onSourcesChanged` + `plannerListeners`, dokazati da `invalidateQueries` poziva refetch. Postojeći `src/test/perf/cards-query-bench.test.ts` ostaje netaknut (cards je out-of-scope u M1).

### Migration safety

- Stara `useCategorySources` API potpisa (`(categoryId) => Source[]`) ostaje identična — nema call-site izmjena u 4 konzumera (`ZettelkastenView`, `CategoryView`, `GlobalSearch`, vlastiti fajl).
- `usePlannerData` returns objekat je super-set postojećeg — propa-konzumenti (`StrategicPlanner`, `PlannerSetupWizard`, `OperationsTab`, `DisciplineTab`, `useDashboardData`, `ActivityHeatmap`, `CognitiveAnalytics`) ne mijenjaju import.
- Feature flag nije potreban — read-path je čista zamjena, write-path netaknut.

### Verifikacija

1. `bunx tsc --noEmit` — 0 errors.
2. `bunx vitest run` — postojeći testovi prolaze + novi `query-bridges.test.ts`.
3. Smoke: otvoriti planner view + sources tab; promijeniti planner config → svi sub-tabovi se sync-uju kroz jedan invalidate (umjesto 3 paralelna `useState` re-fetcha).
4. Konzole: 0 novih warning-a; React DevTools profiler treba pokazati **manje** re-rendera u `StrategicPlanner` (deduplikacija kroz query cache).

### Rizici i mitigacije

| Rizik | Mitigacija |
|---|---|
| TanStack ne deduplikuje između mount-a ako su key-evi nestabilni | Hash util + `useMemo` na svim derived key-evima |
| Bridge dvostruko invalidira (event + manualni call) | Bridge je idempotentan; `invalidateQueries` je no-op za queries u `inactive` stanju |
| `placeholderData` vrati prazno prije boot-a planner cache-a | `enabled: plannerCacheReady` flag iz `initPlannerCache()` (već postoji u boot flow) |
| Bundle size +30 KB gzipped | Prihvatljivo; uklanja `useDeferredCompute` boilerplate u 11 mjesta (~150 LOC) |

### Estimat: +600 / −300

- Novo: `client.ts` (~30), `keys.ts` (~80), `bridges.ts` (~120), `hash.ts` (~30), `query-bridges.test.ts` (~150), planner emitter (~40), `App.tsx` izmjene (~20), refaktor 2 hook fajla (~130).
- Uklonjeno: `useDeferredCompute` pozivi + manuelni `useState/useEffect` subscriptions u sources i planner hookovima (~300 LOC).
