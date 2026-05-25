
# Plan: Provider Hell + Lokalni EventBus

Dva paralelna zadatka koja se rade u istom PR-u — Task A briše Context skele, Task B briše duple izvore istine (EventBus → Zustand). Oboje cilja istu metu: jedan SSOT (Zustand) bez parazitnih re-rendera.

## Trenutno stanje (mjereno)

App.tsx provider stack (od korijena ka dolje):
```text
TooltipProvider
└─ HashRouter
   └─ AppProvider
      └─ CardProvider                  ← composition: 3 ugnijezdjena providera
         ├─ CategoryBridge (hook)
         ├─ CardStateProvider           ← 4 nested Context.Provider iznutra
         │  ├─ CardStateInternalsContext
         │  ├─ CardStateContext
         │  ├─ ReviewStateContext
         │  └─ CategoryStatsContext
         └─ ActionsProvider             ← 3 nested Context.Provider iznutra
            ├─ CardActionsContext
            ├─ CategoryActionsContext
            └─ BackupActionsContext
      └─ PomodoroProvider
      └─ UIProvider
   └─ SessionProvider
   └─ ErrorBoundary
   └─ BootRecoveryGate
   └─ MainLayout
```

Ukupno **10 Context.Provider** node-ova prije `MainLayout`-a. `CategoryStateProvider` je već no-op shim (čita iz `categoryStore` preko `useSyncExternalStore`). `cardMap` je već u Zustand `cardMapStore`. Većina action hookova (useCardCRUD, useCategoryManagement) već zove `cardRepository` / `categoryRepository` direktno — Context im služi samo za stabilnu identitet referencu.

EventBus lokalna potrošnja (kandidati za brisanje):
- `CARDS_UPDATED` — emit: `cardRepository`, `RemapFromBackupDialog`, `useHealthMonitor` (2×). Sub: `cardMapInvalidator`.
- `CATEGORIES_UPDATED` — emit: `categoryRepository`. Sub: `categoryStateInvalidator`.
- `MNEMONICS_UPDATED` — emit: `TextSelectionTooltip`, `MnemonicModule`. Sub: `MnemonicModule`.
- `KB_ARTICLE_UPSERTED / REMOVED` — emit: `useArticleMutations`, `useArticleDraft`, `useWikiLinkAutoCreate`. Sub: `backlink-index`.
- `PROVIDER_FALLBACK` — diagnostički, umire sa Task A.
- `TAB_*` — već dead constants.

**Čuvamo:** `DB_BLOCKED / DB_UNBLOCKED / DB_ERROR_CHANGED` (cross-cutting infra signali, ne UI sync).

---

## Task A — Brisanje Provider skela

### 1. Konverzija state hookova na Zustand (zero Context)

- **`useCardData`** — danas čita `cards` (derivat `mapToArray(cardMap)`), `dueCards`, `stats`, `cardCountByCategory`, `ready`. Prepisati u jedan modul `src/store/useCardDerivedSelectors.ts`:
  - `useCards()` — `useSyncExternalStore(cardMapStore.subscribe, () => mapToArray(state.map))` sa cache-iranom array referencom (mutira se samo kad map promijeni).
  - `useCardAggregatesStore(categories)` — premjesti `useCardAggregates` (čista funkcija + WeakMap cache) iza `useMemo` na ovaj hook.
  - `useCardReady()` — boot status izlazi iz nove `useAppBootstrap()` (vidi #3).
- **`useReviewData`** — `reviewLog` + `srSettings`. Premjestiti `useReviewSettingsStore` u Zustand `reviewSettingsStore` (`src/store/useReviewSettingsStore.ts`). Action surface (`commitReviewEntry`, `replaceReviewLog`, `updateSRSettings`) ostaje na istoj instanci, pristup preko selektora.
- **`useCategoryStatsData`** — derivat iz `useCardAggregatesStore`; ekstrahovati u `useCategoryStats()` selektor.
- **`useCategoryData`** — već radi iz `categoryStore`, ostaje neizmijenjeno (briše se samo `CategoryStateProvider` shim).
- **`useCardStateInternals`** — briše se. Konzumeri (`ActionsProvider`, `useSettingsActions`) direktno zovu `cardRepository` / store setter-e / `reviewSettingsStore` action-e.

### 2. Konverzija action hookova (bez Context-a)

`useCardOnlyActions`, `useCategoryActions`, `useBackupActions` prestaju biti Context lookup. Postaju thin compose hookovi koji vraćaju memoizirane bundle-e:

```ts
// useCardOnlyActions.ts (novo)
export function useCardOnlyActions(): CardActionsValue {
  const crud = useCardCRUD();
  const annotations = useCardAnnotations();
  return useMemo(() => ({ ...crud, ...annotations }), [crud, annotations]);
}
```

Hookovi `useCardCRUD` / `useCardAnnotations` / `useCategoryManagement` / `useCardExport` / `useCardImport` već su čisti — uklanjaju im se `setCardMapState` / `setCategoryRecords` / `setReviewLog` parametri (mrtvi — sve ide kroz repository). Tipovi (`CardActionsValue`, itd.) ostaju u `actions-contexts.ts` (preimenovati u `actions-types.ts`).

`useSettingsActions` postaje thin wrapper oko `reviewSettingsStore.updateSRSettings`.

### 3. Boot side-effects → `AppBootstrap` komponenta

Side-effecti danas montirani u `CardStateProvider` (`useCardBootstrap`, `useCardSyncEffects`, quit-flush effect) + `CategoryBridge` (`useCategoryStateBridge`) konsoliduju se u jedan `<AppBootstrap />` koji renderuje `null` i montira se kao sibling unutar `BootRecoveryGate`. Read-paths (Zustand selektori) više ne zavise od ovog node-a.

### 4. Brisanje fajlova

- `src/contexts/cards/CardStateProvider.tsx` → brisanje, javni hookovi premješteni u `src/store/useCardDerivedSelectors.ts` + `src/contexts/cards/useSettingsActions.ts`.
- `src/contexts/cards/CategoryStateProvider.tsx` → brisanje shim provider-a; `useCategoryData`, `useCategoryStateBridge`, `setCategoryRecordsShim` ostaju (premještaju se u `src/store/useCategorySelectors.ts` + `src/contexts/cards/useCategoryStateBridge.ts`).
- `src/contexts/cards/ActionsProvider.tsx` → brisanje. 
- `src/contexts/cards/actions-contexts.ts` → preimenovati u `actions-types.ts` (samo tipovi).
- `src/contexts/cards/useActions.ts` → prepisati u compose hookove (bez `useContext`).
- `src/contexts/cards/_providerFallback.ts` → brisanje (PROVIDER_FALLBACK event takođe nestaje u Task B).
- `src/contexts/cards/CardProvider.tsx` → svesti na: `<RecoveryGate><AppBootstrap />{children}</RecoveryGate>`.

### 5. Novi App.tsx stack (cilj)

```text
TooltipProvider
└─ HashRouter
   └─ SessionProvider
      └─ BootRecoveryGate
         └─ MainLayout
            └─ <AppBootstrap />  + <Routes/>
```

4 wrappera (Tooltip / HashRouter / SessionProvider / BootRecoveryGate). `UIProvider` i `PomodoroProvider` ostaju jer drže pravi React state — premještaju se INSIDE `BootRecoveryGate` ili refaktoriraju u Zustand u zasebnom PR-u (van skopa).

---

## Task B — Eliminacija lokalnih EventBus evenata

### 1. `CARDS_UPDATED` → direktni store pozivi

- `cardRepository.put/patch/bulkPut/remove` — već mutiraju `cardMapStore`. Skinuti `eventBus.emit(CARDS_UPDATED)` poziv.
- `cardMapInvalidator` → brisanje (cache je sad sam store).
- `useHealthMonitor` orphan-cleanup → poziva `cardRepository.bulkRemove()` direktno (već to radi); `eventBus.emit` linije se brišu.
- `RemapFromBackupDialog` → poziva `cardRepository.replaceAll()` ili ekvivalent; emit se briše.
- `main.tsx` `initCardMapInvalidator()` poziv se briše.

### 2. `CATEGORIES_UPDATED` → direktni store pozivi

- `categoryRepository` emit briše se; svi pisači već prolaze kroz `setCategoryStoreRecords`.
- `categoryStateInvalidator` → brisanje. 
- `main.tsx` `initCategoryStateInvalidator()` poziv se briše.

### 3. `MNEMONICS_UPDATED` → Zustand subscribe

`MnemonicModule` slušalac zamijeniti `useSyncExternalStore` nad `mnemonicStore` (postoji u `src/features/mnemonic/mnemonic-storage.ts`). `TextSelectionTooltip` emit briše se nakon što `mnemonic-storage` writer mutira store sinhrono.

### 4. `KB_ARTICLE_UPSERTED / REMOVED` → backlink index subscription na zettelkasten store

`backlink-index.ts` `initBacklinkIndexSubscriptions` zamijeniti `zettelkastenStore.subscribe((s, prev) => diff(s, prev))` — index reaguje na upsert/remove diff lokalno. Emit pozivi iz `useArticleMutations / useArticleDraft / useWikiLinkAutoCreate` brišu se.

### 5. `PROVIDER_FALLBACK` + `TAB_*`

- `PROVIDER_FALLBACK` event i `_providerFallback.ts` brišu se sa Task A.
- `TAB_HEARTBEAT / TAB_REPLY / TAB_LEAVING` konstante uklanjaju se iz `event-bus-types.ts` (već unused).

### 6. `event-bus.ts` ostaje

Samo za `DB_BLOCKED / DB_UNBLOCKED / DB_ERROR_CHANGED`. Modul ostaje, ali listenerCount na health-check-u opada drastično. Memo `mem://technical-choices/event-bus-architecture` ažurira se (uloga svedena na DB infra signale).

---

## Tests

- Postojeći testovi koji mockuju Context: `phase-a-p0`, `phase-b-p1`, `provider-fallback.test.tsx` — adaptirati ili obrisati.
- `card-map-invalidator.test.ts` + `category-state-invalidator.test.ts` → brisanje.
- Dodati `src/test/app-bootstrap-tree.test.tsx` — render `<App />`, assert `document.querySelectorAll('[data-app-mounted]').length === 1` + ručno brojanje Context Provider node-ova ≤ 4 preko React DevTools nije pouzdano; umjesto toga assert preko snapshot-a render-tree-a iz `react-test-renderer`.
- Dodati `src/test/event-bus-residual.test.ts` — `eventBus.getListenerCount()` nakon punog boot-a ne smije premašiti 3 (samo DB_* kanali).
- Smoke run cijelog `vitest run` mora proći zeleno.

## Rizici i mitigacija

| Rizik | Mitigacija |
|---|---|
| `useSyncExternalStore` cache stable identity za `cards = mapToArray(map)` — bez memoizacije pravi novu array referencu svaki tick | Mapa-mutacija već triggeruje store version bump; cache-irati posljednji rezultat u modulu (`let cached = null` + version compare). |
| Repository `emit` brisanje razbije test mockove koji slušaju CARDS_UPDATED | Globalna grep + zamjena svih `eventBus.subscribe(CARDS_UPDATED, ...)` testova; assertion-e prepisati na `cardMapStore.subscribe`. |
| Backlink index propušta event ako neko upsert-uje bez prolaska kroz store | Tek nakon što potvrdim da svi upsert path-ovi (useArticleMutations, useArticleDraft, useWikiLinkAutoCreate, import flow) idu kroz `zettelkastenStore.upsertArticle`. Ako ne — prvo te pisače rerout-ovati pa onda brisati event. |
| HMR transient: bez Provider-a, fallback warning iz `useCardData` više neće postojati | Selektor iz Zustand vraća prazan `[]` dok store nije inicijalizovan — pokriveno `ready` flag-om iz `useAppBootstrap`. |
| Mnemonic store možda ne postoji ili nije reaktivan | Provjera prije starta Task B koraka #3; ako fali — uvesti tanki Zustand wrapper oko `mnemonic-storage` ili zadržati MNEMONICS_UPDATED dok se ne refaktoriše posebno. |

## Acceptance

1. App.tsx ima ≤ 4 wrappera prije `MainLayout`-a.
2. `git grep -n "createContext\|useContext" src/contexts/cards/` vraća nula hitova.
3. `eventBus.getListenerCount()` nakon boot-a ≤ 3 (samo DB_*).
4. Sve postojeće card/category/review interakcije rade (smoke test passes).
5. Memo `mem://architecture/provider-cleanup-v1` se nadograđuje na v2 sa novim brojevima (10 → 4 Provider node-ova).

## Touched files (procjena)

- **Briše:** `CardStateProvider.tsx`, `ActionsProvider.tsx`, `CategoryStateProvider.tsx`, `_providerFallback.ts`, `cardMapInvalidator.ts`, `categoryStateInvalidator.ts`, 2 testa za invalidatore.
- **Nova:** `src/store/useCardDerivedSelectors.ts`, `src/store/useReviewSettingsStore.ts`, `src/contexts/AppBootstrap.tsx`, `src/contexts/cards/actions-types.ts`.
- **Mijenja:** `App.tsx`, `AppContext.tsx`, `CardProvider.tsx`, `useActions.ts`, `useCardCRUD.ts`, `useCardAnnotations.ts`, `useCategoryManagement.ts`, `useCardImport.ts`, `useCardExport.ts`, `cardRepository.ts`, `categoryRepository.ts`, `backlink-index.ts`, `event-bus-types.ts`, `main.tsx`, `useHealthMonitor.ts`, `RemapFromBackupDialog.tsx`, `TextSelectionTooltip.tsx`, `MnemonicModule.tsx`, `useArticleMutations.ts`, `useArticleDraft.ts`, `useWikiLinkAutoCreate.ts`.

Procjena: ~22 izmijenjenih + 4 nova + 8 obrisanih fajla. Većina je mehanička zamjena (TypeScript kompajler vodi).
