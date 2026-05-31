# Provider Cleanup v2 — finalna pasovina

Cilj: srušiti preostale React Context wrappere koji još uvijek nose stanje, ukloniti shim no-op providere i preorganizovati `src/contexts/` tako da samo prave kompozicione tačke ostaju "konteksti". Sve ostalo prelazi u Zustand store-ove ili `src/hooks/`.

## Trenutno stanje (post-v1)

```text
App.tsx
└── QueryClientProvider → TooltipProvider → HashRouter
    └── AppProvider (composition root)
        └── RecoveryGate → AppBootstrap → MotionProvider
            └── PomodoroProvider          ← pravi Context, split tick/stable
                └── UIProvider             ← pravi Context, ima HMR fallback hack
                    └── SessionProvider    ← pravi Context, snapshot+queues
                        └── BootRecoveryGate
                            └── children
```

7 wrappera. 3 prava Context-a sa stanjem + 3 deprecated no-op shim fajla (`CardStateProvider`, `CategoryStateProvider`, `DbErrorProvider`) + 1 misleading naziv (`BootStateProvider.tsx` koji je samo hook).

## Cilj

```text
App.tsx
└── QueryClientProvider → TooltipProvider → HashRouter
    └── AppProvider
        └── RecoveryGate → AppBootstrap → MotionProvider → BootRecoveryGate
            └── children
```

4 wrappera. Niti jedan domenski Context.

## Korak po korak

### Korak 1 — Pomodoro → Zustand (`src/store/usePomodoroStore.ts`)

- Kreirati novi store sa shape: `{ mode, seconds, running, cycleCount, toggle(), reset(), _tick() }`.
- Interval logiku premjestiti u modul-level subscriber (singleton tajmer aktivan dok `running===true`); pretplata na `loadAppSettings()` cached ref ostaje.
- Single hook API: `usePomodoroStore(selector)` u stilu Zustand-a.
- Backward-compat shimovi u `@/contexts/AppContext`:
  - `usePomodoroStable()` → `usePomodoroStore(s => ({mode,running,cycleCount,toggle:s.toggle,reset:s.reset}), shallow)`
  - `usePomodoroTick()` → `usePomodoroStore(s => ({seconds:s.seconds}))`
  - `usePomodoroContext()` → composed selector
  Označiti shimove `@deprecated` i otvoriti follow-up za migraciju pozivalaca (header/sidebar samo).
- `PomodoroProvider` postaje no-op shim (nije više u tree-u).

### Korak 2 — Session → Zustand (`src/store/useSessionStore.ts`)

- Shape: `{ isSessionActive, isEnding, queuePending, snapshot, reviewQueue, errorQueue, readQueue, queueSize, startSession, endSession, queueReview, queueError, queueMarkRead }`.
- Derivacija `isProcessing = isEnding || queuePending` kao selektor.
- `persistQueue.subscribe(...)` se mountira jednom u modul-level inicijalizatoru (poziva se prvi put kad se selektor izvrši ili lazy iz storea).
- `useSessionContext()` postaje thin wrapper koji čita kroz selektore (drop-in API).
- Test fajl `src/test/phase-b-p1.test.tsx` se ažurira da ne wrapuje sa `SessionProvider` (više nije potreban).
- `SessionProvider` postaje no-op shim.

### Korak 3 — UIProvider → Zustand + route hook

- `editingCardId` ide u `useUIStore` (mali Zustand store sa SSOT mirror već u modul scopeu — eliminiše paralelni `_currentEditingCardId` slot jer Zustand `getState()` već daje sync čitanje).
- `view` ostaje izveden iz `useCurrentView()` (route-bound, ne stanje).
- `setView` se eksportuje kao tanak helper hook `useSetView()` (samo wrapper nad `useNavigate`).
- `handleToggleTag` se eksponira direktno iz `useCardOnlyActions()` (već postoji `toggleTag` tamo) — eliminiše konvenijencijski layer.
- Side-effects (`recordAppEntry`, `useNotificationScheduler`, `useActivityTracker`) se preselje u `AppBootstrap` (već je single mount point).
- `useUIContext()` postaje shim koji vraća kompozit iz storea + view + setView (drop-in API), označen `@deprecated` za narednu pasovinu.
- HMR fallback (`UI_FALLBACK` + `console.warn`) se uklanja — više nema providera kojeg HMR može da odveže.
- `UIProvider` postaje no-op shim (nije u tree-u).

### Korak 4 — Brisanje shim fajlova i preimenovanja

- Obrisati prazne shim komponente iz: `CardStateProvider.tsx`, `CategoryStateProvider.tsx`, `DbErrorProvider.tsx`, `PomodoroProvider.tsx`, `UIProvider.tsx`, `SessionContext.tsx` (zadržati hooks/store API kao module fajlove).
- Preseliti hookove u tačnije lokacije:
  - `src/contexts/boot/BootStateProvider.tsx` → `src/hooks/useBootState.ts`
  - `src/contexts/db/DbErrorProvider.tsx` → `src/hooks/useDbError.ts` (modul-level subscribe ostaje)
  - `src/contexts/routing/useCurrentView.ts` → `src/hooks/useCurrentView.ts`
  - `src/contexts/cards/useCategoryStateBridge` → `src/hooks/useCategoryStateBridge.ts`
  - `src/contexts/cards/useCardAggregates.ts` → `src/hooks/useCardAggregates.ts`
  - `src/contexts/cards/useCardSyncEffects.ts` → `src/hooks/useCardSyncEffects.ts`
- `src/contexts/` zadržava samo: `AppContext.tsx` (composition root + barrel re-exports), `AppBootstrap.tsx`, `boot/BootRecoveryGate.tsx`, `cards/actions-contexts.ts` + `cards/useActions.ts` (Actions tri-Context koje radi po dizajnu).

### Korak 5 — Verifikacija

- `tsc --noEmit` clean.
- `npm run lint:walls` clean (nove putanje ne udaraju ni jedan domain wall).
- `npm run lint` clean (ili u okviru postojećeg max-warnings).
- `vitest run` — postojeći 611+ testovi prolaze; ažurirana 1–2 test fajla (`phase-b-p1`, ev. UIProvider testovi ako ih ima).
- Spot-check u preview-u:
  - Pomodoro timer broji svake sekunde, toggle/reset rade, header se ne re-renderuje na tick.
  - Učenje + ponavljanje sesija: start → grade nekoliko kartica → end; processing overlay pravilno pokazuje "Spremanje" dok `persistQueue` ne drenira.
  - Edit dijalog: otvori, izađi, vrati se (SSOT mirror radi).
  - Refresh nakon promjene foldera ne razbija UI (HMR fallback eliminisan bez regresije).
- Bundle: očekivano malo smanjenje (Context wrappers + duplicate ref state ide u Zustand).

### Korak 6 — Memory update

Ažurirati `mem://architecture/provider-cleanup-v1` na v2 (ili dodati novi `provider-cleanup-v2`):
- Tree pao 7→4 wrappera.
- Pomodoro, Session, UI state migrirani na Zustand store-ove.
- `src/contexts/` reduced na composition root + AppBootstrap + BootRecoveryGate + Actions contexts.
- Pure hookovi preseljeni u `src/hooks/`.

Ažurirati Core u `mem://index.md`:
> Provideri: `AppContext → RecoveryGate → AppBootstrap → MotionProvider → BootRecoveryGate`. Domenski state je u Zustand store-ovima (`useCardMapStore`, `categoryStore`, `reviewSettingsStore`, `useSessionStore`, `usePomodoroStore`, `useUIStore`). Actions su jedini Context wrapper unutar `AppBootstrap` (`ActionsProvider` sa 3 ko-locirana Context-a).

## Tehnički detalji

- **Pomodoro tajmer kao singleton**: `usePomodoroStore` subscriber pokreće `setInterval` kad `running` postaje true i clearuje kad postaje false. Drži se postojećeg whitelista u `eslint.config.js` za raw `setInterval` u engine kodu.
- **Backward-compat shimovi**: zadržavamo `useUIContext`, `useSessionContext`, `usePomodoro*` u `@/contexts/AppContext` barrelu sa `@deprecated` markerima. Velika migracija pozivalaca je follow-up (svjesno se izbjegava 50+ touch-points u jednom prolazu).
- **Test izolacija**: Zustand store-ovi dobijaju test reset helper (`__resetForTests`) tamo gdje već nemaju, da bi `vitest` setup mogao očistiti stanje između testova. `src/test/setup.ts` se ažurira ako treba.
- **Render performance**: glavni dobitak je eliminacija UIProvider re-rendera (svaki `editingCardId` set rerenderuje cijelo stablo) — Zustand selektor scope-uje rerendere na consumere koji čitaju to polje.

## Rizici i mitigacije

- **Pomodoro tajmer drift**: pomjeranje iz React efekta u Zustand može uvesti dvostruki tajmer ako se subscriber neispravno mountuje. Mitigacija: subscriber se inicijalizuje lazy u modulu (jedanput), uz idempotent guard.
- **Session test fajl**: `phase-b-p1.test.tsx` koristi `renderHook` sa `SessionProvider` wrapperom. Mora se ažurirati paralelno sa storeom; izolovano u Korak 2.
- **HMR regresija**: uklanjanje `UIProvider` fallback-a teoretski može razotkriti drugi HMR problem. Mitigacija: Zustand store je modul-level (preživljava HMR po default-u), pa fallback i nije bio fundamentalno potreban.
- **Veliki diff**: ~10 izbrisanih/preseljenih fajlova + ~6 novih store fajlova + svi importi koji su išli kroz `src/contexts/*` putanje. Mitigacija: brišemo POSLE move-ova, shimovi u barrelu drže drop-in API.

## Estimat

~12–18 izmijenjenih fajlova + 4 nova store fajla + brisanje 5 shim fajlova. Realno 1 srednji session, isporučivo iterativno po koracima (svaki korak može da se merge-uje samostalno).