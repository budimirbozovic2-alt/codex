## Plan refaktora SSOT-a u `CardStateProvider`

Implementacija u 3 sigurna koraka (C2 → B2 → B5) i jedan opcioni veliki zahvat (A1).

---

### Korak 1 — C2: Razdvajanje monolitnog `useMemo` po polju

**Fajl:** `src/contexts/cards/CardStateProvider.tsx` (linije 281–351)

Trenutni jedan `useMemo` računa istovremeno: `dueCards`, `stats`, `categoryStats`, `cardCountByCategory` — svaka promjena `cards` ili `categories` rebuilduje sve.

**Pristup — jedan pass, više memoa s preciznim zavisnostima:**

1. Zadržati JEDAN interni `useMemo` koji radi O(n) prolaz i vraća sirov agregat: `{ dueIds, sectionTotals, leech, perCatAccum, countByCategory }` — bez sortiranja i bez konačnih `categoryStats`. Zavisi samo od `cards` (FSRS state utiče samo na ovaj sloj).
2. Razdvojiti izvedene "javne" memoе:
   - `dueCards` — izvedeno iz `aggregate.dueIds` + `cardMap` (sort po `nextReview`).
   - `stats` — izvedeno iz `aggregate.sectionTotals` + `cards.length` + `aggregate.leech`.
   - `cardCountByCategory` — izvedeno iz `aggregate.countByCategory` + `categories` (popunjavanje nula).
   - `categoryStats` — izvedeno iz `aggregate.perCatAccum` + `categories`.
3. Dodati posebne `useMemo` wrappere za context value-ove tako da preimenovanje kategorije (koje ne mijenja UUID listu `categories`) ne okida ništa, a dodavanje/uklanjanje kategorije pogađa samo `cardCountByCategory` i `categoryStats`.
4. Postojeći `bucketCacheRef` fingerprint pristup zadržati — već je optimalan.

**Test:** `src/test/category-view-contract.test.ts` mora i dalje proći; dodati mali test koji potvrđuje da rename kategorije ne mijenja referencu `dueCards`/`stats`.

---

### Korak 2 — B2: `dbErrorState` iz modul-level u React kontekst

**Fajlovi:**
- `src/lib/db-schema.ts` (linije 9–11, 250–331)
- novi: `src/contexts/db/DbErrorProvider.tsx`
- `src/hooks/useCardBootstrap.ts` (linija 92)
- `src/contexts/cards/CardStateProvider.tsx` (već ima `DbErrorContext` na liniji 122 — proširiti)

**Pristup:**

1. U `db-schema.ts` zadržati internu varijablu **samo** kao trenutni snapshot za async pozivaoce koji nemaju React kontekst (npr. `useCardBootstrap` rana faza). Dodati emisiju event-a kroz postojeći `eventBus` kad se mijenja:
   - novi event: `EVENT_TYPES.DB_ERROR_CHANGED` (dodati u `src/lib/event-bus.ts`)
   - svaki set/clear `dbErrorState`-a u `db-schema.ts` (linije 257, 300, 305, 331) prati `eventBus.emit(DB_ERROR_CHANGED, currentState)`.
2. Napraviti `DbErrorProvider` koji:
   - Inicijalno čita `getDbErrorState()`.
   - Subscribe-uje na `DB_ERROR_CHANGED` i drži state u `useState`.
   - Eksponira `useDbError()` hook (zamjena za trenutni iz `CardStateProvider`).
3. Premjestiti `<DbErrorContext.Provider>` van `CardStateProvider`-a (omotati ga oko cijele kompozicije u `App.tsx` ili `MainLayout.tsx`) tako da se UI komponente (RecoveryPanel) više ne oslanjaju na to da je `CardStateProvider` ready.
4. Ukloniti `dbError` iz `CardStateContextValue` da ne miješa odgovornosti.

**Net efekat:** UI dobija reaktivni dbError signal iz pravog izvora; modul-level varijabla i dalje postoji ali kao implementacioni detalj, ne kao SSOT.

---

### Korak 3 — B5: Surgical update u HealthMonitor handleru

**Fajlovi:**
- `src/components/HealthMonitor.tsx` (linije 145–187)
- `src/contexts/cards/CardStateProvider.tsx` (linije 215–229)
- `src/lib/event-bus.ts` (proširiti payload `CARDS_UPDATED`)

**Pristup:**

1. Standardizovati payload event-a `CARDS_UPDATED`:
   ```ts
   { source: string; cardIds?: string[]; reason: "orphan-cleanup" | "heal-stale" | "remap" | ... }
   ```
2. `handleCleanOrphans` (linija 160) i `handleHealStaleLinks` (linija 179) već znaju **tačno** koje `cardIds` su mutirale — proslijediti ih kroz event payload.
3. U `CardStateProvider` handler (linije 215–229):
   - Ako `payload.cardIds` postoji i ima **≤ N** stavki (npr. ≤ 200), uradi surgical re-fetch samo tih kartica preko `db.cards.bulkGet(cardIds)` i mergeuj u `cardMap` (kroz postojeći `setCardMapState` + `cardMapRef` patch + `bumpMapVersion`).
   - Ako payload-a nema (legacy emiteri kao remap-from-backup koji mijenja sve), zadrži postojeći full reload kao fallback.
4. Bez ikakvog `schedulePersist` — podaci su već u IDB-u (HealthMonitor je upisao direktno preko `db.cards.update`).

**Net efekat:** Tipičan orphan cleanup od npr. 5 kartica više ne radi O(N) IDB scan + full re-render svih subscribera.

---

### Korak 4 (OPCIONO, niska hitnost) — A1: Migracija `cardMap` na Zustand

**Cilj:** Eliminisati `cardMapRef` ↔ `cardMap` dvojnost; jedna data struktura koja podržava i O(1) mutacije i selektivne re-rendere.

**Fajlovi (procjena):**
- novi: `src/store/useCardStore.ts` (Zustand sa `subscribeWithSelector` + `immer` middleware)
- `src/contexts/cards/CardStateProvider.tsx` — postaje tanak wrapper koji čita iz storea i dalje izlaže iste kontekste (kompatibilnost)
- `src/hooks/useCardCRUD.ts` — `cardMapRef.current[id] = ...` postaje `useCardStore.setState(...)` koji je sinhrоn
- `src/lib/persist-queue.ts` — `mapToArray` čita iz storea umjesto iz arg-a
- Svi konzumenti `useCardData()` ostaju nepromijenjeni

**Pristup:**

1. Dodati zavisnost `zustand` (već se koristi za `useSourceReaderStore` — nema novog deps-a).
2. Definisati store:
   ```ts
   interface CardStore {
     cardMap: CardMap;          // mutiše se kroz immer
     version: number;            // zamjena za _mapVersion
     patch: (id, fn) => void;
     bulkUpsert: (cards) => void;
     remove: (id) => void;
     reset: (map) => void;
   }
   ```
3. `useCardData()` interno koristi `useStore(useCardStore, selectorMemo)` — selektivna pretplata (komponenta koja gleda `dueCards` ne re-renderuje se na rename kategorije).
4. Derivacije iz Koraka 1 ostaju iste, ali se računaju kroz `useCardStore` selektore + `useMemo` na rezultatu.
5. CRUD hookovi gube `cardMapRef` i `setCardMapState`, postaju 1-line pozivi store-a; `useEffect` sync na liniji 140 nestaje.
6. `persistQueue` ostaje nepromijenjen (i dalje prima eksplicitne `Card` objekte).

**Migracioni plan u koracima:**
- 4a: Uvesti store paralelno; `CardStateProvider` ga puni iz svog `cardMap`-a (dual-write privremeno).
- 4b: Migrirati `useCardCRUD` da piše u store; ukloniti `cardMapRef`.
- 4c: Migrirati `useCardData` da čita iz storea; obrisati `cardMap` useState.
- 4d: Obrisati `useEffect` ref-sync, `bumpMapVersion`, `_mapVersion` cache.

**Rizik:** Visok — dira CRUD i sve konzumere kartica. Preporuka: izvesti tek nakon što su koraci 1–3 mergeani i stabilizovani.

---

### Tehnički detalji

**Redoslijed mergeа:** 1 → 2 → 3 → (pauza za QA) → 4.
**Bez breaking changeа za konzumere** u koracima 1–3 (svi `useCardData()` / `useDbError()` ostaju isti).
**Testovi koji se moraju zelenjeti:**
- `src/test/category-view-contract.test.ts`
- `src/test/persist-queue-c3c4.test.ts`
- `src/test/spaced-repetition.test.ts`

### Šta plan ne radi

- Ne dira `Session/ReviewLog` tok (već je `commitReviewEntry` SSOT).
- Ne dira `onCardLinksCleared` handler (već poziva `schedulePersist`).
- Ne uvodi novi state library osim opcione Zustand integracije u Koraku 4.
