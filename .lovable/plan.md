# Fix: Boot loads entire card table into RAM

## Diagnoza

`src/hooks/card-bootstrap/loadInitialData.ts:44-49` blokira boot na `withTimeout(listAllCards(), 5000)`. Cijela `cards` tabela putuje preko worker boundary u RAM prije nego što UI uopće postane spreman. `useCardBootstrap.ts:86` zatim `cardMapReplaceAll` puni `cardMapStore` i (preko subscribera u `useCardMapStore.ts:71-73`) TanStack `['cards','all']`.

**Pravi greenfield fix** (potpuna eliminacija RAM mape) zahtijeva migraciju svih selektora (`useCardsByCategoryRam`, `useCardsBySubcategoryRam`, `useCardsByChapterRam`, `useCardCountByCategoryRam`, `useCardByIdRam`, `useCardsBySource`, `useCardsArray`, `useCardMap`) na scoped TanStack queries (`cardsByCategory` itd.). To je 2–3x veći PR od ovog. Predlažem **dvije faze** — ovaj PR isporučuje Fazu 1 (uklanja blokiranje boota, što je glavni performance simptom), Faza 2 ostaje kao posebna stavka.

## Faza 1 — Defer card load off boot critical path (THIS PR)

### Cilj
Boot dostiže `READY` bez čekanja `listAllCards()`. Kartice se učitavaju u pozadini odmah nakon prvog frame-a, populiraju `cardMapStore` (i preko subscribe-a TanStack cache), bez splash blokiranja.

### Promjene

**1. `src/hooks/card-bootstrap/loadInitialData.ts`**
- Ukloniti `listAllCards()` iz `Promise.all`.
- Vratiti `cards: []` u `InitialData` (ili promijeniti tip: `cards?: undefined`, ali jednostavnije zadržati `[]` za type stabilnost i označiti deferred).
- Dodati novi export `loadCardsDeferred(): Promise<Card[]>` — wrapper oko `withTimeout(listAllCards(), 8000, "cards load (deferred)", [])`.

**2. `src/hooks/useCardBootstrap.ts`**
- Nakon `transition({ type: "READY" })` i `markBootStep("cards:ready")`, schedule-ati deferred load:
  ```ts
  scheduleIdle(async () => {
    markBootStep("cards:deferred-load-start");
    const cards = await loadCardsDeferred();
    cardMapReplaceAll(arrayToMap(cards));
    markBootStep("cards:deferred-load-done", `${cards.length} cards`);
  });
  ```
- `scheduleIdle` helper: `requestIdleCallback(fn, { timeout: 1000 })` s fallback-om na `setTimeout(fn, 0)` (zbog Electron-a, gdje rIC postoji u modernim Chromium verzijama).
- Greška u deferred loadu: log + jednokratni toast "Kartice se učitavaju u pozadini, pokušajte ponovo iz Health Monitora", ne blokira UI.

**3. Splash poruke** (`src/hooks/card-bootstrap/loadInitialData.ts:54`)
- Maknuti `${cards.length} kartica učitano` poruku (cards je 0 u ovoj fazi). Zamijeniti generičkim `"Učitavanje gotovo"`.

**4. Selektori (`useCardsByCategoryRam` itd.)**
- Bez izmjena. Vraćaju `EMPTY` dok deferred load ne završi; nakon `cardMapReplaceAll`, `useSyncExternalStore` re-renderira sve subscriber-e (već se to dešava na svakom mutate-u).

**5. Testovi**
- `src/test/card-map-writes.test.ts`: bez izmjena (testira write-path).
- Dodati `src/test/boot-deferred-cards.test.ts`: mock `bootDb`/`runSchema`/`runHeal`, verifikovati da `useCardBootstrap` dostiže `ready === true` prije nego što `listAllCards` mock resolve-uje.
- Update `src/test/perf/cards-query-bench.test.ts` ako test ovisi o eager bootu (vjerovatno ne — direktno poziva `listAllCards`).

**6. Memory update**
- `mem://architecture/storage-and-persistence-v6` (ili nasljednik): dodati "Boot deferiše cards load — `loadInitialData` ne čeka `listAllCards`; kartice se streamaju u RAM nakon prvog frame-a via `scheduleIdle`."

### Validacija
- `tsc --noEmit` → 0 grešaka.
- `vitest run` → 586/589 (postojeći baseline) + novi boot test.
- Manualna smoke provjera u preview: Dashboard widget i CategoryView prikazuju kratko "0 kartica" pa se popunjavaju (može trebati skeleton state — vidi Otvoreno).

### Otvoreno (decision needed po izvršenju)
- **Skeleton vs prazan state**: tokom deferred load prozora (50–500ms), `useCardsByCategory(id)` vraća `EMPTY`. Views (CategoryView, Dashboard) trenutno renderiraju "Nema kartica". Dvije opcije:
  - **A**: Pustiti kratki prazan state (najjednostavnije, vjerovatno neprimjetno na <200ms loadu).
  - **B**: Eksponirati `useBootCardsReady()` hook (čita boot state) i prikazati skeleton dok je `false`.
  
  Predlažem **A** za Fazu 1; ako se ispostavi da je trep vizuelno primjetan, dodajemo B u follow-upu.

## Faza 2 — Eliminacija RAM mape (NOT in this PR)

Posebna stavka za kasnije:
- Migrirati `useCardsByCategoryRam` → `useQuery(['cards','category',id], () => cardsByCategory(id))`.
- Isti pattern za subcategory/chapter/source/byId/count.
- Ukloniti `cardMapReplaceAll` iz boota potpuno.
- Demontirati `cardMapStore` kao SSOT — postaje pomoćni cache za persist-queue diffing (ili ga sasvim ukloniti ako persist-queue ne treba RAM snapshot).
- Cijena: ~15–20 consumer files, novi query keys, invalidacija nakon mutacija.

## Out of scope
- `decodeRows` error policy (audit Section 3).
- `COUNT(*)` optimizacije za sources/mindMaps (audit Section 2).
- Zettelkasten `listAllArticles` redesign.
- Bulk `tx.run` per row u `logs.ts` / `bulkPutMnemonics`.
