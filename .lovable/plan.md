# Čišćenje Provider Stabla i Event Busa

## Trenutno stanje

Provider stack u `App.tsx` (od korijena ka dolje) je **13 nivoa duboko**:

```text
HashRouter
└─ BootStateProvider        ← no-op wrapper (kod već postoji)
   └─ AppProvider
      └─ CardProvider
         └─ DbErrorProvider
            └─ CategoryStateProvider     ← već čita iz Zustand `categoryStore`
               └─ CardStateProvider      ← 4 stacked Context.Provider-a iznutra
                  └─ CardActionsProvider
                     └─ CategoryActionsProvider
                        └─ BackupActionsProvider
                           └─ PomodoroProvider  ← 2 stacked iznutra
                              └─ UIProvider
                                 └─ SessionProvider
                                    └─ BootRecoveryGate
```

Plus `eventBus` (`src/lib/event-bus.ts`) drži `BroadcastChannel`, heartbeat `setInterval`, `beforeunload` listener i `_softReset` HMR mašineriju — **sav cross-tab kod je mrtav** jer je app Pure Desktop Electron (jedan prozor po procesu).

## Cilj

Skinuti provider depth sa **13 → 7** i istrgnuti BroadcastChannel mašineriju, bez ijednog `breaking change`-a na ~49 consumer fajlova koji koriste `useCardData / useCategoryData / useUIContext / itd.` Sav state ostaje u Zustand store-ovima koje već imamo (`categoryStore`, `useCardMap`); providers se ukidaju tamo gdje je njihov jedini posao bio "Context wrapping nad eksternim store-om".

## Plan (5 inkrementalnih PR-ova u jednoj seansi)

### PR-A — Brisanje no-op `BootStateProvider` + flatten action providers

1. `src/contexts/boot/BootStateProvider.tsx`: ostaviti samo `useBootState` hook export; ukloniti `BootStateProvider` komponentu (no-op je).
2. `src/App.tsx`: ukloniti `<BootStateProvider>` wrapper iz JSX-a (useBootState i dalje radi — modul-level store).
3. Spojiti `CardActionsProvider + CategoryActionsProvider + BackupActionsProvider` u jedan `ActionsProvider` (`src/contexts/cards/ActionsProvider.tsx`). Iznutra zadržati tri postojeća Context-a (CardActionsContext, CategoryActionsContext, BackupActionsContext) — jedan provider, tri vrijednosti. `useCardOnlyActions / useCategoryActions / useBackupActions` ostaju identično public API.
4. `CardProvider.tsx`: zamijeniti tri stacked providera sa `<ActionsProvider>`.

Depth: 13 → 10. Nula promjena na consumer fajlovima.

### PR-B — `DbErrorProvider` → `useDbError()` hook

1. `src/contexts/db/DbErrorProvider.tsx`: izbrisati `DbErrorContext` i `DbErrorProvider`. Konvertovati `useDbError()` u plain hook koji koristi `useSyncExternalStore` nad modul-level `subscribe(listener)` funkcijom — `subscribe` interno koristi `eventBus.subscribe(EVENT_TYPES.DB_ERROR_CHANGED, …)`, `getSnapshot` čita `getDbErrorState()` iz `db-schema`.
2. `CardProvider.tsx`: ukloniti `<DbErrorProvider>` wrapper, `RecoveryGate` i dalje zove `useDbError()` (sada hook).
3. Test: `src/test/db-error-dedupe.test.tsx` — adaptirati ako Mount-uje provider (vjerovatno samo skinuti wrapper).

Depth: 10 → 9. Public API (`useDbError`) ostaje.

### PR-C — `CategoryStateProvider` → Zustand selectors

Postojeći provider je već čisti most nad `categoryStore` (Zustand). Brišemo ga:

1. `src/contexts/cards/CategoryStateProvider.tsx`: pretvoriti u modul **bez providera**. `useCategoryData` postaje hook nad `categoryStore` (vraća isti `{categories, categoryRecords, subcategories}` objekt, memo-iziran preko `useSyncExternalStore` + `useMemo`). `useCategoryStateSetter` i `useCategoryStateInternals` se eksportuju kao plain funkcije (već koriste modul-level `setCategoryRecordsShim` / `getCategoryStoreRecords`).
2. Side-effect-i koji su živjeli u provideru (`primeExaminerProfilesFromRecords`, `registerCategoryStateSetter`) — premjestiti u novi `useCategoryStateBridge()` hook koji se montira jednom unutar `CardProvider`.
3. `CardProvider.tsx`: ukloniti `<CategoryStateProvider>` wrapper, dodati `useCategoryStateBridge()` poziv.
4. Verifikovati 7 consumer fajlova koji zovu `useCategoryData()` — API identičan, bez promjena.

Depth: 9 → 8.

### PR-D — EventBus: BroadcastChannel → in-process EventTarget

Cross-tab kod je dead code na desktop-only platformi. Konvertujemo bus u lean in-process pub/sub uz očuvanje cijelog public API-ja:

1. `src/lib/event-bus.ts`:
   - Skloniti `BroadcastChannel`, `channel?.postMessage`, `onmessage`.
   - Skloniti `heartbeatIntervalId`, `activeTabs`, `_beforeUnloadHandler`, `TAB_HEARTBEAT/REPLY/LEAVING` subscribe logiku.
   - `emit()` poziva samo `handleIncomingMessage()` (lokalni listeneri).
   - `getTabCount()` → vraća `1`.
   - `_softReset()` → samo `listeners.clear()`.
   - `destroy()` → samo `listeners.clear()`.
   - Singleton + HMR dispose ostaju.
2. `event-bus-types.ts`: ostaviti `TAB_HEARTBEAT/REPLY/LEAVING` konstante (referencirane su u tipovima) ali ih više niko ne emituje.
3. `useHealthMonitor.ts`: ako negdje koristi `getTabCount > 1` granu, ukloniti je (potvrditi grepom).
4. Test sweep: `db-error-dedupe`, `category-state-invalidator`, `card-map-invalidator`, `zettelkasten-wiki-link-integration` — svi rade preko lokalnih listenera, prolaze nepromijenjeni.

Bundle delta: −~2KB (BroadcastChannel i heartbeat kod). DX win: nema više fantomskih duplih listenera pri HMR-u.

### PR-E — Verifikacija + dokumentacija

1. Pokrenuti puni test suite: očekujemo zero regresija.
2. Grep za `<BootStateProvider|<DbErrorProvider|<CategoryStateProvider|<CardActionsProvider|<CategoryActionsProvider|<BackupActionsProvider` u `src/` — sve linije moraju biti obrisane (osim definicija ako su zaostale).
3. Ažurirati memo index: dodati `mem://architecture/provider-cleanup-v1` sa kratkim opisom "Provider tree spljošten 13→7; cross-tab event bus uklonjen (desktop-only)".

## Šta NE radimo

- **Ne ukidamo** `CardStateProvider`, `UIProvider`, `SessionProvider`, `PomodoroProvider`, `AppProvider` — ovi drže pravi React state (`useState`, `useRef`, side-effect mount) koji bi mu trebao non-trivial refactor svih consumer fajlova. To je za sljedeću iteraciju.
- **Ne mijenjamo** consumer API (49 fajlova). Svi `useCardData / useUIContext / useSessionContext / ...` ostaju identični.
- **Ne dodajemo** novi pub/sub mehanizam (npr. mitt). Postojeći lean EventBus pokriva sve slučajeve.
- **Ne diramo** `draftRegistry` — već je čist Zustand-like store; pominje se u pitanju samo kao primjer šablona.

## Acceptance kriterijumi

- React DevTools "Components" panel prikazuje 6 providera između `HashRouter` i `MainLayout` (umjesto 12).
- `grep -r "new BroadcastChannel" src/` → 0 rezultata.
- `bunx vitest run` → svi postojeći testovi prolaze bez izmjena (osim minornog skidanja providera u DbError testu).
- Otvaranje DevTools → Performance: prvi render `<App>` skida ~6 React Fiber nodova (smaller flame graph root).
- HMR test: izmijeniti `CardActionsProvider` (sad `ActionsProvider`) → ne pojavljuje se duplikat listener u `eventBus.getListenerCount()`.

## Tehnički detalji

**`useDbError` hook (PR-B):**
```ts
let _snap: DbErrorState = getDbErrorState();
const subscribers = new Set<() => void>();
eventBus.subscribe(EVENT_TYPES.DB_ERROR_CHANGED, (next) => {
  const incoming = (next as DbErrorState) ?? null;
  if (sameDbError(_snap, incoming)) return;
  _snap = incoming;
  for (const fn of subscribers) fn();
});
export function useDbError() {
  return useSyncExternalStore(
    (cb) => { subscribers.add(cb); return () => subscribers.delete(cb); },
    () => _snap,
    () => _snap,
  );
}
```

**`useCategoryData` hook (PR-C):**
```ts
const selectState = (s) => s;
export function useCategoryData() {
  const records = useSyncExternalStore(
    categoryStore.subscribe,
    () => categoryStore.getState().records,
    () => categoryStore.getState().records,
  );
  return useMemo(() => ({
    categories: records.map(r => r.id),
    categoryRecords: records,
    subcategories: buildSubcatMap(records),
  }), [records]);
}
```

**Slim EventBus (PR-D):**
```ts
class EventBus {
  private listeners = new Map<EventType, Set<(p: unknown) => void>>();
  emit(type, payload) {
    const ls = this.listeners.get(type);
    if (!ls) return;
    for (const cb of ls) { try { cb(payload); } catch (e) { logger.error(...) } }
  }
  subscribe(type, cb) { /* unchanged */ }
  getTabCount() { return 1; }
  getListenerCount(type?) { /* unchanged */ }
}
```
