## Refaktorisanje HealthMonitor.tsx — A/A/A arhitektura

Cilj: razdvojiti I/O, state orkestraciju i prezentaciju u tri sloja, bez promjene UI ili ponašanja.

### 1. `src/lib/services/healthService.ts` (novi fajl) — Pure I/O sloj

Izolovan servis koji radi isključivo sa Dexie/storage/localStorage. Bez React-a, bez state-a.

Eksportuje:
- `type TableStat`, `type OrphanResult`, `type CrashEntry`, `type HealthReport`
- `async fetchTableCounts(): Promise<TableStat[]>` — paralelno izračunava 11 `db.*.count()` poziva, vraća već formatiran niz sa imenima (ikone ostaju u komponenti).
- `async fetchStorageUsage(): Promise<{ idb, ls }>` — wrapper oko `getStorageUsage()`.
- `async detectIntegrityIssues(): Promise<{ orphans, staleSub, staleChap }>` — sva orphan/stale logika koja je trenutno inline u `refresh()`.
- `async cleanOrphans(cardIds, fallbackCategoryId): Promise<void>` — izvršenje, bez toast/event poziva.
- `async healStaleLinks(): Promise<HealReport>` — wrapper oko postojeće `healCardTaxonomy(true)`.
- `loadCrashLog(): CrashEntry[]` i `clearCrashLog(): void` — localStorage pristup centralizovan ovdje.
- `async buildHealthReport(): Promise<HealthReport>` — kompozitni metod koji pozove sve gore i vrati jedinstveni snapshot.

Komponenta i hook **nikad** ne import-uju `db` direktno.

### 2. `src/hooks/useHealthMonitor.ts` (novi fajl) — State orkestracija

Jedan `useReducer` (ili jedan `useState<HealthReport | null>`) umjesto 13 zasebnih `useState`.

Vraća:
```ts
{
  report: HealthReport | null,   // tableStats, idb, ls, orphans, staleSub, staleChap, crashLog
  loading: boolean,
  cleaning: boolean,
  healing: boolean,
  lastRefresh: Date,
  refresh: () => Promise<void>,
  cleanOrphans: () => Promise<void>,
  healStaleLinks: () => Promise<void>,
  clearCrashLog: () => void,
}
```

Interno:
- `useEffect` na mount → `refresh()`
- `refresh()` → `healthService.buildHealthReport()` → setReport
- `cleanOrphans()` → servis + toast + `eventBus.emit(CARDS_UPDATED)` + lokalni patch report-a
- `healStaleLinks()` → servis + toast + event + `refresh()`
- `clearCrashLog()` → servis + toast + lokalni patch

Toast i eventBus pozivi ostaju u hook-u (cross-cutting side effects), ne u servisu.

### 3. `src/components/HealthMonitor.tsx` — Čista prezentacija

Samo JSX. Poziva `useHealthMonitor()`, prosljeđuje `report` i `actions` postojećoj strukturi (Alert, Card, Progress, Badge). Ikone (`BookOpen`, `Clock`...) mapiraju se po `name` u maloj lokalnoj `iconForTable()` funkciji jer su čisto prezentacioni detalj.

Zadržava:
- `RemapFromBackupDialog` integraciju (lokalni `useState` za `remapOpen` ostaje — to je čisto UI state).
- `formatBytes` helper ostaje u komponenti (presentation utility).

### Verifikacija

- Postojeći testovi prolaze (`bunx vitest run`).
- Vizuelno poređenje: refresh, cleanup orphan, heal stale, clear crash log — identično ponašanje.
- Nema novih `db.` import-ova izvan `healthService.ts` (provjera `rg`).

### Ocjene poslije

- SSOT: A — jedan `report` objekat, nema duplikata stanja.
- SOA: A — I/O u servisu, orkestracija u hooku, render u komponenti.
- UI vs Logika: A — komponenta nema `await`, nema `db`, nema `localStorage`.
