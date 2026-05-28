# B1 — Cards cut-over (TanStack Query as cards SSOT)

## Cilj

Završiti ono što je audit identifikovao: `cardMapStore` (Zustand) i `cards` bridge žive u paralelnim svjetovima. Bridge `onCardsChanged → invalidateQueries(['cards'])` puca u prazno — niko ne čita `['cards']` osim jednog filtera. Selektori (`useCardsByCategory/Subcategory/Chapter/Source/Id`, `useCardCountByCategory`, `useCardsArray`) i dalje idu kroz `useSyncExternalStore` nad Zustand atomom. Mutacije (`useCardMutations`) rade sinhroni Zustand commit ali nemaju `onMutate` / `cancelQueries` — race window prema worker reload-u je otvoren.

B1 pretvara TanStack Query u jedinog SSOT-a za card reads, a `cardMapStore` postaje **interni RAM mirror** koji vidi samo `cards.ts` query layer (za bootstrap warmup) i potencijalno `persist-queue`. UI ga ne dira direktno.

## Scope (in)

1. `useQuery(['cards','all'])` kao izvor `useCardsArray`, sa `select` selektorima za sve granular hookove (`byCategory`, `bySubcategory`, `byChapter`, `bySource`, `byId`, `countByCategory`).
2. `useCardMutations` dobija `onMutate` (cancelQueries + setQueryData optimistic patch) i `onError` rollback preko `setQueryData` sa prethodnim snapshotom — `reloadCardsFromIdb` ostaje fallback samo ako persist baci.
3. Bridge `onCardsChanged → invalidateQueries(['cards'])` ostaje, ali sad ima stvarne potrošače; `notifyCardsChanged` u `cardMapWrites` ne mijenja se.
4. Zustand `cardMapStore` ostaje kao **interni write-side ledger** za `cardMapWrites` (jer persist-queue radi diff nad mapom). UI selektori (`src/store/useCardSelectors.ts`, `src/store/useCardsBySource.ts`, `CardStateProvider.useCards`) prepisuju se da čitaju iz TanStack cache-a.
5. Rename: `reloadCardsFromIdb` → `reloadCardsFromDb` (cosmetic; uklanja zadnji Dexie naming leak iz Core memory tačke).
6. Memory update: `mem://architecture/tanstack-query-read-path` dopuniti — cards su sad pravi TanStack-driven read; `mem://architecture/sqlite-ssot-cutover` označiti `useCardMapStore` kao "internal write-side mirror, not UI SSOT".

## Scope (out)

- `cardMapStore` se NE briše — persist-queue diffing i `cardMapWrites.applySyncDelta/replaceAll/clearLinks/patch` i dalje gađaju Zustand atom kao izvor istine za optimistic commit. Brisanje store-a je posebna kasnija faza (zahtijeva refaktor persist-queue-a).
- `useCardBootstrap` zadržava `cardMapReplaceAll(arrayToMap(cards))` — dodaje se samo `queryClient.setQueryData(['cards','all'], cards)` seed nakon bootstrap-a kako prvi render ne bi morao čekati `queryFn`.
- Audit tačke iz drugih oblasti (boot payload, COUNT(*), zettel `listAllArticles`, `decodeRows` swallow) ostaju za kasnije.

## Pristup — fazni

### Faza 1: query layer
- `src/lib/query/keys.ts`: dodati `cards.all`, `cards.byCategory(id)`, `cards.bySubcategory(id)`, `cards.byChapter(id)`, `cards.bySource(id)`, `cards.byId(id)`, `cards.countByCategory(id)` (svi share isti `['cards']` prefix → bridge invalidacija ostaje jedan red).
- Novi fajl `src/hooks/card/useCardsQuery.ts`:
  - `useAllCards()` → `useQuery({ queryKey: ['cards','all'], queryFn: listAllCards, staleTime: Infinity })`.
  - Granular hookovi (`useCardsByCategory`, ...) implementirani kao `useAllCards()` + `select` sa memoizovanim filterom (stable ref preko `useRef` cache identičnog onom u `useCardSelectors.ts`).
- Bootstrap u `useCardBootstrap`: nakon `cardMapReplaceAll(...)` dodati `queryClient.setQueryData(queryKeys.cards.all, cards)`.

### Faza 2: prepisivanje selektora
- `src/store/useCardSelectors.ts`, `src/store/useCardsBySource.ts`, `src/contexts/cards/CardStateProvider.tsx::useCards`:
  - Re-export iz `useCardsQuery.ts` (zadržati identične potpise → nula call-site izmjena).
  - `useCardsArray` postaje thin wrapper oko `useAllCards()?.data ?? EMPTY`.
- `src/store/index.ts` barrel: maknuti re-export `cardMapStore`, `useCardMap`, `cardMapRefFacade` iz public API-ja; ostaju dostupni samo za `@/lib/cards/cardMapWrites` interno.

### Faza 3: mutacije sa pravim optimizmom
- `src/hooks/card/useCardMutations.ts` — dodati `onMutate` u svaki mutation:
  1. `await queryClient.cancelQueries({ queryKey: ['cards'] })`
  2. snapshot: `const prev = queryClient.getQueryData<Card[]>(queryKeys.cards.all)`
  3. optimistic `setQueryData(queryKeys.cards.all, applyPatchLocally(prev, input))`
  4. `return { prev }` (kontekst)
- `onError`: ako `prev` postoji → `setQueryData(queryKeys.cards.all, prev)`. Tek u krajnjem fallback-u (npr. ako persist baci nakon što je Zustand već potvrdio) → `reloadCardsFromDb([...ids])`.
- `onSettled`: `invalidateQueries(['cards'])` ostaje (idempotentno sa bridge invalidacijom).

### Faza 4: rename i memory
- `cardMapWrites.reloadCardsFromIdb` → `reloadCardsFromDb` (samo string rename + svi callsite-ovi: `useCardMutations`, `healthService`, `remap-from-backup`).
- Memory update kako je gore opisano.

## Technical details

- **`select` memoization**: TanStack `select` se re-evaluira na svakom `data` referenci. Granular selektori moraju memoizovati svoj filter izlaz po `(data, key)` — koristiti istu `useRef` shape kao u `useCardSelectors.ts` (`{ map, key, result }`) i poredtiti `data === cache.data`. Bez ovoga refilter ide na svaki invalidate.
- **CardMap vs Card[]**: `listAllCards()` vraća `Card[]`. Trenutno selektori interno mapiraju iz `CardMap` (object). Najjednostavnije: query čuva `Card[]`, granular selektori iteriraju (već to i rade trenutno).
- **`onMutate` interakcija sa Zustand**: `cardMapWrites.put/bulkPut/remove/patch` ostaje sinhroni — Zustand atom služi persist-queue-u kao trigger. Optimistic update ide u OBOJE: Zustand (preko `cardMapWrites.*`) + TanStack `setQueryData`. Bridge `notifyCardsChanged → invalidateQueries(['cards'])` će onda samo refetch-ovati `listAllCards` u pozadini i potvrditi stanje. Ako `staleTime: Infinity` i ručni `setQueryData`, invalidate triggeruje background refetch koji konvergira ka durable SSOT.
- **Race fix**: trenutno `useCardMutations.onError` poziva `reloadCardsFromIdb([id])` ali UI je već renderovao stari Zustand state (sync rollback). Sa `onMutate` snapshot-om, rollback je trenutan u TanStack cache-u; `reloadCardsFromDb` ostaje samo da resyncuje Zustand mirror.

## Verifikacija

- `bunx tsc --noEmit`
- `bunx vitest run` — postojeći `card-selectors.test.tsx`, `use-cards-by-source.test.tsx`, `card-map-writes.test.ts`, `spaced-repetition.test.ts` moraju proći nepromijenjeni (interfejs hookova se ne mijenja).
- Smoke: otvoriti CategoryView, gradirati karticu, provjeriti da rollback radi kad se persist namjerno baci (DEV log inspection).

## Što se NE radi u ovom PR-u

- Demontaža Zustand `cardMapStore` (zahtijeva persist-queue refaktor — zaseban PR).
- `decodeRows` error policy, COUNT(*) optimizacije, zettel `listAllArticles` redesign — sve iz audit-a, ali van scope-a B1.
- Brisanje `getCardMap` / `cardMapRefFacade` (i dalje koristi `cardMapWrites`).
