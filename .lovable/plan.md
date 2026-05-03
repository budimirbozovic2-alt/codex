# Uzrok freeze-a kod masovnog importa i `addCard`

## Šta sam analizirao
- `src/components/category/BulkImportDialog.tsx` (`confirmImport`)
- `src/components/category/CardCreateMenu.tsx` (DOCX import grana)
- `src/hooks/useCardCRUD.ts` (`addCard`, `addFlashCard`, `bulkAddCards`)
- `src/contexts/cards/CardStateProvider.tsx` (sync ref/state, aggregate)
- `src/lib/persist-queue.ts` (debounced flush)
- `src/lib/db-queries.ts` (`idbBulkApply`)
- `src/lib/card-buckets.ts` (rebuild + fingerprint)

## Glavni uzroci

### 1. (KRITIČNO) Bulk import zove `addFlashCard` jedan-po-jedan
`BulkImportDialog.confirmImport`:
```ts
for (const p of parsed) addFlashCard(p.question, p.answer, categoryId);
```
i ista grana u `CardCreateMenu` za DOCX flash karte:
```ts
cards.forEach(c => addFlashCard(...))
```

Svaki `addFlashCard` poziv interno radi:
```ts
setCardMapState(prev => ({ ...prev, [card.id]: card }))
```
React 18 batchuje pozive, ali updater funkcije se i dalje izvršavaju **sekvencijalno** u commit fazi. Za N novih kartica i M postojećih dobijamo **N × O(M+N) = O(N²)** kloniranja samog `CardMap` objekta. Pri 200 importovanih + 1500 postojećih = ~340.000 property-copy operacija prije nego što render može da krene. Glavni razlog blokiranog UI-a.

Plus N pojedinačnih `schedulePersist({type:"put"})` poziva — flush je debounced 16ms pa se sve sliva u jedan `idbBulkApply`, ali samo enqueue petlja na 200+ stavki nije problem; problem je state updater.

### 2. (BITNO) `cardMapRef` sinhronizacioni `useEffect` briše ref-delta i ponovo klonira O(N)
`CardStateProvider.tsx:134`:
```ts
useEffect(() => { cardMapRef.current = { ...cardMap }; }, [cardMap]);
```
Nakon svakog batched commita ref se kompletno re-klonira. Za 2000 kartica nakon importa to je još jedna sinhrona O(N) alokacija na main threadu — odmah nakon već skupog state commita. Takođe potire smisao "Ref-Delta" obrasca jer CRUD je već sam upisao identičan objekat u ref pre `setCardMapState`.

### 3. (BITNO) Posledične O(N) derivacije nakon importa
Nakon commita pokreću se:
- `cards = mapToArray(cardMap)` — O(N) kada se `_mapVersion` promijeni (a `bumpMapVersion()` se zove N puta tokom petlje, što nije problem za cache, ali jeste u sinhronoj petlji ukoliko bi neko čitao međurezultat).
- `aggregate` useMemo — O(total sections).
- `bucketFingerprint` + eventualni `buildCardBuckets` — O(N) (taxonomy se mijenja jer se ubacuju novi `categoryId`-evi, pa fingerprint puca i radi se rebuild).
- `cardCountByCategory`, `categoryStats` — O(C).

To je sve neizbježno, ali kad ide na "tail" iza O(N²) iz #1 efekat je vidljiv freeze.

### 4. (Manje, ali doprinosi) `addCard`/`addFlashCard` toast nije problem; **ali** `updateCard` zove `toast.success` po pozivu — nije relevantno za import, samo napomena za pojedinačni "addCard" (jedan novi esej ne bi trebao da kočI; ako kočI, krivac je #2 + #3 nakon ponovnog mountanja "Manage" taba).

### 5. Pojedinačni `addCard` (jedna nova kartica) zašto kočI?
Sam state update je O(M) (jedna kopija `cardMap`). To je trivijalno. Ono što ipak troši je:
- `useEffect` clone iz #2 (još jedan O(M) clone),
- `aggregate` koji prolazi kroz **sve** kartice i **sve** sekcije,
- `buildCardBuckets` jer se fingerprint promijenio (dodali smo novi `categoryId` ili nije postojao taj chapterId — često rebuilduje),
- Re-render svih konzumera `useCardData()` (CategoryView, Dashboard widgets, GlobalSearch invalidation, itd.).

Kod velikih biblioteka (5000+ kartica) jedan `addCard` već može da napravi 50–150 ms zastoj na slabijem hardveru. Cilj je svesti to na <5 ms.

---

# Plan ispravki

## Korak 1 — Bulk path u BulkImportDialog (KRITIČNO)
**Fajlovi:** `src/components/category/BulkImportDialog.tsx`, `src/components/category/CardCreateMenu.tsx` (i `MassFlashImportTrigger.tsx` props), `src/contexts/cards/CardActionsProvider.tsx` već exportuje `bulkAddCards`.

- Promijeniti prop `addFlashCard` u `BulkImportDialog`/`MassFlashImportTrigger` na `bulkAddFlashCards: (pairs: {question:string;answer:string}[], categoryId, subcategoryId?) => void` **ili** dodati `bulkAddCards` prop i lokalno konstruisati `Card[]` koristeći `createFlashCard` iz `@/lib/spaced-repetition`.
- `confirmImport` sklapa cijeli `Card[]` jednim mapiranjem i poziva `bulkAddCards(newCards)` jednom.
- DOCX flash grana u `CardCreateMenu.onImport` se tretira isto: pretvori sve u `Card[]` i pozovi `bulkAddCards` jednom.
- Toast ostaje jedan ("Uvezeno N kartica").

Rezultat: jedan `setCardMapState`, jedan `schedulePersist({type:"bulk"})`, jedan flush u `idbBulkApply`.

## Korak 2 — Eliminisati skupi `cardMapRef` sync useEffect
**Fajl:** `src/contexts/cards/CardStateProvider.tsx` (linija 133–134, plus svi CRUD-ovi koji već održavaju ref).

Trenutno: `useEffect(() => { cardMapRef.current = { ...cardMap }; }, [cardMap]);` — bezuslovno kopira čitav `cardMap`.

Plan:
- Inicijalizovati `cardMapRef` iz prvog "load" outputa (`useCardBootstrap` već postavlja `cardMap` — proširiti ga da zajedno sa `setCardMapState(map)` postavi i `cardMapRef.current = map`). Tada inicijalna sinhronizacija ne treba useEffect.
- CRUD hookovi već održavaju ref u sinhronu (Ref-Delta) prije svakog `setCardMapState`. Isto važi za `onCardLinksCleared`, `onCardReviewConfirmed`, `CARDS_UPDATED` listener (provjeriti i tamo).
- Zameniti useEffect "best-effort guardom" koji se okida samo ako referenca odstupa **i** veličine se razlikuju (defensive sync), bez kopiranja čitavog objekta — npr. petlja koja dodaje samo missing keys i briše stale; ili još jednostavnije: ukloniti useEffect kompletno jer su svi mutator paths već Ref-Delta-aware. Zadržati developer assert u DEV build-u koji upozorava ako veličine ne odgovaraju (postavlja `cardMapRef.current = cardMap` samo u tom slučaju).

Rezultat: jedan put kod importa nestaje O(N) clone na svakoj promjeni state-a.

## Korak 3 — Smanjiti broj `bumpMapVersion()` + `mapToArray` kod bulk-a
**Fajl:** `src/hooks/useCardCRUD.ts` (`bulkAddCards`).

Trenutno (već dobro): `bulkAddCards` radi jedan setState i jedan bumpMapVersion. Provjeriti da li se to poštuje i u svim drugim "bulk" call sajtovima (DocxImporter, AutoSplitDialog već koristi `bulkAddCards`). Ako negdje petlja zove `addCard` umjesto `bulkAddCards`, prebaciti.

Dodatno: dodati javni `bulkAddFlashCards` helper u `useCardCRUD` koji prima Q/A parove i interno konstruise `Card[]` — da consumere ne tjeramo da importuju `createFlashCard`.

## Korak 4 — Lazy/deferred derivacije velikih lista (poboljšanje)
**Fajl:** `src/contexts/cards/CardStateProvider.tsx`.

Za biblioteke s >2000 kartica:
- `aggregate` ostaje sinhron (potreban za stats), ali eventualno premjestiti `bucketFingerprint`+`buildCardBuckets` iza `requestIdleCallback` ili svesti rebuild na throttling kada je import-batch veći od 100 kartica (npr. via mikro-flag "bulk in progress" koji ostavi `EMPTY_BUCKETS` ili keširanu vrijednost dok flush ne završi).
- Alternativno: izolovati `buckets` u zaseban context (`CardBucketsContext`) tako da widgeti koji ne trebaju buckete (npr. SettingsPage, BackupCard) ne re-renderuju kad se buckets promijeni.

Ovaj korak je opcioni; ako su koraci 1+2 dovoljni za fluentnost, preskačemo ga.

## Korak 5 — Sigurnosna mreža: chunkovani persist za vrlo velike importe
**Fajl:** `src/lib/persist-queue.ts` (ili u `idbBulkApply`).

Ako bulk ima >1000 kartica, podijeliti `bulkPut` u chunkove od po ~500 unutar iste rw transakcije, sa `await Promise.resolve()` između chunkova da se main thread odblokira. Sprječava dugačku IDB transakciju koja blokira renderer.

---

# Verifikacija
- Ručni test: import 200 P:/O: parova u kategoriju s 1000+ postojećih kartica — UI mora ostati responzivan (nema duže od 100 ms blokade).
- Ručni test: pojedinačni "Dodaj esej" u istoj kategoriji — instantan close dijaloga.
- Postojeći testovi: `bun test` (unit), posebno `zettelkasten-bulk-create.test.ts`.
- DEV console: tražiti `[persistQueue] flush ok puts=… ms` — trebalo bi da bude **jedan** flush po importu, ne N.

# Redoslijed implementacije
1. Korak 1 (najveći win, mali rizik).
2. Korak 2 (rizičnije, treba pažljivo provjeriti sve mutator pateve).
3. Korak 3 (niska rizik).
4. Korak 4–5 samo ako mjerenja nakon 1–3 i dalje pokazuju zastoj.
