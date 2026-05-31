# PR-E — Eliminacija `cardMapStore` (Opcija B)

Cilj: ukloniti dvojnu RAM mapu kartica. TanStack Query cache postaje JEDINI in-memory store za kartice. Optimistic UI ide isključivo kroz `onMutate` + `setQueryData`. Sync RAM lookup primitivi (`cardMapWrites.put/patch/remove/...`) se gase.

## Audit svih dodirnih tačaka (potpuna inventura)

### Write-side (sync RAM commit → mora postati async TanStack mutation)

| # | Lokacija | Trenutni API | Tip operacije |
|---|---|---|---|
| W1 | `useCardMutations.ts` | `cardMapWrites.put/bulkPut/remove/patchAsync/bulkPatchAsync` u 5 mutacija | core — već ima onMutate snapshot/rollback nad `cards.root` |
| W2 | `useCardCRUD.ts:splitCard` | `getCard(id)` (sync RAM lookup) prije bulkUpsert | mora postati `getCardsByIds([id])` |
| W3 | `useCardImport.ts:importData` | `cardMapReplaceAll(nextMap)` + `getCardMap()` za atomic apply | replace cache cijele tabele |
| W4 | `useCardImport.ts:importCards` | `cardMapBulkPut(created)` | bulk insert + invalidate |
| W5 | `useCardSyncEffects.ts` | `clearLinks(ids)`, `clearNeedsReview(id)` iz source callbacks | async write + invalidate |
| W6 | `runHeal.ts` (step 2 frequencyTag) | `cardMapWrites.bulkPut(mutated)` + `persistQueue.flush()` | direktan SQLite bulkPut |
| W7 | `lib/migrations/heal-card-taxonomy.ts` | `cardMapWrites.bulkPut(patched)` | isto |
| W8 | `lib/migrations/remap-from-backup.ts` | `cardMapWrites.bulkPut(updated)` | isto |
| W9 | `lib/services/healthService.ts:cleanOrphans` | `cardMapWrites.bulkPut(patched)` (loaded iz `getCardsByIds`) | isto |
| W10 | `lib/editor-v4/lazy-migrate.ts:migrateAllCards` | `cardMapWrites.snapshot()` (cijela RAM mapa) + `bulkPut` | `listAllCards()` + bulk SQLite write |
| W11 | `card-bootstrap/runHeal` poziv `loadCardsDeferred` | dohvata sve kartice u RAM samo za heal | nakon W6 — fetch lokalno u runHeal, ne sije cardMap |

### Read-side (cija mapa se popunjava kroz `seedCardMap` — uzrok memorijske duplikacije)

| # | Lokacija | Posljedica |
|---|---|---|
| R1 | `hooks/card/useCardsQuery.ts` — svaki `useQuery` ima `seedCardMap(rows)` | OVO je root cause "Dual-State". Brise se kompletno. |
| R2 | `store/useCardSelectors.ts` — `*Ram` selektori (used by `card-selectors.test.tsx`) | testovi se prepisuju da koriste TanStack hooks |
| R3 | `store/useCardsBySource.ts` — `useCardsBySourceRam` | isto, samo za testove |
| R4 | `store/useCardMapStore.ts` — `useCardMap`, `useCardsArray`, `cardMapRefFacade`, `replaceCardMap`, `setCardMap`, `getCardMap` | cijeli fajl se brise nakon migracije callsite-a |
| R5 | `store/index.ts` — barrel export za sve gore | uklonjeno iz barela |

### Konzumenti `useCardData().cards` (cijela tabela u RAM-u — ostaje, ali sada **samo** kroz TanStack)

`ReviewPage`, `PlannerPage`, `LearnPage`, `DashboardPage`, `StatsPage`, `GlobalSearch`, `MainLayout`, `BackupCard` — već idu kroz `useAllCards()` (TanStack `['cards','all']`). Bez izmjena nakon R1.

## Strategija migracije (4 mikro-PR-a unutar PR-E grane)

### PR-E1 — Direct SQLite write helper + cut seedCardMap

1. Dodati `src/lib/db/queries/cards-writes.ts` sa:
   - `putCardDirect(card: Card): Promise<void>` — `SqlExecutor.transaction` + `notifyCardsChanged`
   - `bulkPutCardsDirect(cards: Card[]): Promise<void>` — isto, batch UPSERT
   - `deleteCardDirect(id: string): Promise<void>`
   - `replaceAllCardsDirect(map: CardMap): Promise<void>` — DELETE FROM cards + bulk insert u istoj tx, za import
2. Ukloniti `seedCardMap()` iz `useCardsQuery.ts` (svih 7 query-ja). TanStack postaje jedini read SSOT — `cardMapStore` prestaje da se popunjava.

### PR-E2 — Optimistic mutations preko `setQueryData`

Refaktor `useCardMutations.ts`:
- `mutationFn` zove direktne SQLite write helpere (PR-E1) — ne `cardMapWrites.*`.
- `onMutate` proširen: pored `cancelQueries` + `snapshot`, **odmah primjenjuje optimistic patch** na sve relevantne keševe:
  - `['cards','all']` — set/replace/delete u nizu
  - `['cards','cat',categoryId]`, `['cards','subcat',...]`, `['cards','chap',...]`, `['cards','source',...]`, `['cards','byId',id]`, `['cards','count',categoryId]` — invalidacija (ili targetirano `setQueryData` gdje je jeftino)
- Pomoćnik `applyOptimisticCardPatch(qc, op)` centralizuje logiku (op = `{type:'put'|'remove'|'bulkPut'|'patch'|'bulkPatch', ...}`).
- `onError` ostaje: restore snapshot. `reloadCardsFromDb` poziv se uklanja (više nema RAM mape za resync).
- `onSettled` invalidira `cards.root` da pokupi serverskim podacima razlike koje optimistic nije pogodio (sigurnosna mreža).

### PR-E3 — Migracija ostalih write callsite-ova (W2–W10)

Po fajlu, redom (svaki sa fokusiranim diff-om):
- **W2** `splitCard`: `getCard(id)` → `(await getCardsByIds([id]))[0]`. Sve ostalo identično (već `await bulkUpsert.mutateAsync` pa `await remove.mutateAsync`).
- **W3** `importData`: `cardMapReplaceAll(nextMap)` → `qc.setQueryData(['cards','all'], Object.values(nextMap))` + `qc.invalidateQueries({queryKey: queryKeys.cards.root})`; `getCardMap()` poziv za `applyImportAtomically.currentMap` zamijeniti `await listAllCards()` → mapa po id-u (atomic-tx već čita iz baze pa je ovo samo merge baseline).
- **W4** `importCards`: koristiti `bulkUpsert.mutateAsync(created)` (postojeća TanStack mutacija).
- **W5** `useCardSyncEffects`: novi mali `useClearCardLinksMutation` / `useClearNeedsReviewMutation` u istom modulu — direktan SQLite update + invalidate. Callback iz `onCardLinksCleared` poziva `mutate()`.
- **W6** runHeal step 2: koristiti `bulkPutCardsDirect(mutatedCards)` (već je u `taskScheduler.idle` post-READY); zatim `notifyCardsChanged()` umjesto persist-queue flush-a.
- **W7/W8/W9/W10**: `cardMapWrites.bulkPut(...)` → `bulkPutCardsDirect(...)`. Za W10 dodatno `cardMapWrites.snapshot()` → `await listAllCards()`.

### PR-E4 — Brisanje mrtve infrastrukture

Tek kad PR-E3 zatvori posljednji import iz `@/domains/cards` koji koristi sync RAM API:
1. Obrisati: `src/store/useCardMapStore.ts`, `src/store/useCardsBySource.ts` (RAM dio), `*Ram` selektori iz `src/store/useCardSelectors.ts`.
2. `src/domains/cards/cardMapWrites.ts`: zadržati SAMO `reloadCardsFromDb` (preimenovati u `refreshCardsCache` → invalidira `['cards']`) i `notifyCardsChanged` re-export. Sve sync write primitive (`put/bulkPut/patch/remove/clearLinks/clearNeedsReview/replaceAll/snapshot/getCard/_writeEpoch/applySyncDelta/patchAsync/removeAsync/bulkPatchAsync`) — brisanje.
3. `src/domains/cards/index.ts`: barel sad re-exportuje samo helpere iz tačke 2.
4. `src/store/index.ts`: uklonjeni svi `cardMap*` re-exporti.
5. ESLint zid W11 ostaje — sada čuva `@/domains/cards` koji je puno tanji.

### PR-E5 — Test prilagodba

| Test | Akcija |
|---|---|
| `card-selectors.test.tsx` | port na `useCardsByCategory` (TanStack) sa `QueryClientProvider` wrapper-om iz `test/helpers/queryWrapper.tsx`. RAM put-ovi → `qc.setQueryData(['cards','all'], rows)`. |
| `use-cards-by-source.test.tsx` | isto kao gore, sa `['cards','source',id]`. |
| `card-map-writes.test.ts` | brisanje (regression za fenomen koji više fizički nije moguć). Dodati novi `card-mutations-optimistic.test.tsx` koji pokriva onMutate setQueryData / onError rollback. |
| `cards-mirror-and-rollback.test.tsx` | rewrite: ukloniti mock `@/domains/cards`; testira da `useCardMutations.save` → optimistic patch vidljiv na `useAllCards` prije server resolve, te rollback na error. |
| Postojeći `query-bridges.test.ts`, `boot-deferred-cards.test.ts`, `phase-a-p0.test.tsx` | provjera da i dalje prolaze nepromijenjeni. |

## Rizici i mitigacije

- **Optimistic patch propusti scoped query**: `onSettled: invalidateQueries(cards.root)` je sigurnosna mreža. Korisnik vidi optimistic odmah, scoped views se osvježe u sljedećem tick-u.
- **`splitCard` race**: PR-B fix (`await bulkUpsert.mutateAsync` pa `await remove.mutateAsync`) se zadržava — ne mijenjamo redoslijed, samo izvor podataka za `card` lookup.
- **Import (W3) je najveći blok**: `applyImportAtomically` se ne dira — samo izvor `currentMap` se mijenja sa RAM na `listAllCards()`. Atomic tx u SQLite-u već garantuje konzistentnost.
- **Memorija**: nakon PR-E1 RAM treba pasti za otprilike veličinu cardMap-a (jedan zapis manje, ne dva). TanStack jedini drži kartice u memoriji.
- **`_writeEpoch` race guard iz PR-B**: postaje irelevantan jer više ne postoji "stari" sync RAM koji bi reload mogao pregaziti. `reloadCardsFromDb` → `refreshCardsCache` je sada čisto `invalidateQueries`.

## Granica izvedbe

Svi koraci se mogu uraditi i validirati testovima nakon **svakog mikro-PR-a**. Posljednji PR-E4 je čisto brisanje — dirnut će ~6 fajlova ali bez logičke izmjene jer su pozivaoci već migrirani.

## Stavke koje se NE diraju

- FSRS algoritam (PR-B fixes ostaju).
- `persistQueue` postoji i dalje za batch ordering — write helperi iz PR-E1 ga koriste interno (`schedulePersist` + opcionalni `flush`).
- `notifyCardsChanged` bridge — ostaje srce read-invalidacije.
- Sve memory entries vezane za Ref-Delta DEPRECATED status — ostaju, ovaj PR ih samo dovršava.
