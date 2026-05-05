# F2 — Card Command Bus + per-cardId Mutex

## Problem

Card mutacije dolaze iz **četiri nezavisna asinhrona izvora**, bez ikakvog locking-a:

1. `patchCard` (akcioni hookovi: `useCardCRUD`, `useCardAnnotations`)
2. `onCardLinksCleared` callback (sources-storage)
3. `onCardReviewConfirmed` callback (sources-storage)
4. `CARDS_UPDATED` bus event → re-fetch (round-trip kroz `db.cards.bulkGet`)

Svaki čita `cardMapRef`, gradi `updated`, pa radi `setCardMap` + `schedulePersist`. Redoslijed je određen JS event loop-om. V5/V10 zaštite (drain prije fetch-a, `updatedAt` guard) su krpe — kada se `patchCard` desi DURING `bulkGet`, ishod zavisi od mikrosekundi.

Postojeći **service-layer mutex** (`category-service.ts`, `_pendingSave: Promise<void>`) serijalizuje IDB writes za kategorije — proširićemo isti pattern na in-memory card sloj.

## Rješenje

**Command Bus** koji prima tipovane komande i serijalizuje ih kroz **per-cardId Promise-chain mutex**. Svaka mutacija prolazi kroz `cardCommandBus.dispatch(cmd)`. Repository ostaje commit sloj — bus samo serijalizuje pristup.

### Arhitektura

```text
                 ┌─────────────────────────────────────────────┐
                 │             cardCommandBus                  │
                 │   ┌───────────────────────────────────┐     │
patchCard ─────► │   │  per-id Promise chains (Map)      │     │
clearLinks ────► │   │  + global lock for replaceAll     │ ──► │ cardRepository
syncDelta ─────► │   │  multi-id: sorted-id acquire      │     │ (commit + persist)
clearNeedsR ───► │   └───────────────────────────────────┘     │
                 └─────────────────────────────────────────────┘
```

### Lock semantika

- **per-id lock**: svaka komanda akvizira tail Promise za svoj id, instalira novu tail prije await-a; sledeći dispatch za isti id čeka.
- **multi-id lock**: ids se sortiraju (deterministički) prije akvizicije → nema deadlock-a između dvije konkurentne multi-id komande.
- **global lock** (`replaceAll`, `applySyncDelta` velikog opsega): blokira sve postojeće chains + svoje continuation postavlja kao globalni gate dok ne završi.
- **GC**: chain entry se briše kad njegov posljednji awaiter razriješi i nije već zamijenjen novijim.

## Tehnička implementacija

### 1. Novi fajl `src/lib/repositories/cardCommandBus.ts`

```ts
export type CardCommand =
  | { type: "put"; card: Card }
  | { type: "bulkPut"; cards: Card[] }
  | { type: "delete"; id: string }
  | { type: "patch"; id: string; patcher: (c: Card) => Card }
  | { type: "bulkPatch"; ids: string[]; patcher: (c: Card) => Card }
  | { type: "clearLinks"; ids: string[] }
  | { type: "clearNeedsReview"; id: string }
  | { type: "applySyncDelta"; rows: Card[]; deletedIds: string[] }
  | { type: "replaceAll"; map: Record<string, Card> };

const _chains = new Map<string, Promise<unknown>>();
let _globalChain: Promise<unknown> = Promise.resolve();

async function withLocks<T>(ids: string[], work: () => T | Promise<T>): Promise<T>;
export function dispatch<T>(cmd: CardCommand): Promise<T>;
export async function drain(): Promise<void>;
```

`commandIds(cmd)` izvlači id-eve iz payload-a; `execute(cmd)` ruta u `cardRepository`. `dispatch` vraća Promise da pozivaoci mogu await-ovati (test, drain).

### 2. Repository ostaje nepromijenjen

`cardRepository.put/patch/...` su sinhrone funkcije nad ref-om i schedule-uju IDB. Bus ih poziva unutar lock-a, što garantuje da read (`cardMapRef.current[id]`) i write (`commitSingle`) nikad nisu razdvojeni drugim mutatorom za isti id.

### 3. Migracija pozivnih mjesta

**`useCardCRUD.ts`** — sve `cardRepository.X(...)` zamijene `await cardCommandBus.dispatch({type:"X", ...})`. Vrijednosti koje funkcije vraćaju (`addCard` vraća kreiranu karticu) — kreiranje ostaje sinhrono, samo dispatch ide kroz bus:

```ts
const addCard = useCallback((q, sections, catId, ...) => {
  const card = createCard(q, sections, catId, subcatId);
  void cardCommandBus.dispatch({ type: "put", card });
  return card;
}, []);
```

Za operacije koje pozivaocu trebaju potvrde (npr. `patchCard` koristi `reviewSection`), vraćamo Promise:

```ts
const patchCard = useCallback(
  (id, patcher) => cardCommandBus.dispatch({ type: "patch", id, patcher }),
  [],
);
```

**`useCardAnnotations.ts`** — `bulkFlagNeedsReview`, `bulkUpdateChapter` → `dispatch({type:"bulkPatch", ...})`. `reviewSection` koristi `patchCard` koji je već kroz bus.

**`useCardSyncEffects.ts`** — najvažnija promjena:

```ts
useEffect(() => onCardLinksCleared((ids) => {
  void cardCommandBus.dispatch({ type: "clearLinks", ids });
}), []);

useEffect(() => onCardReviewConfirmed((id) => {
  void cardCommandBus.dispatch({ type: "clearNeedsReview", id });
}), []);
```

Za `CARDS_UPDATED` (najopasniji put — fetch je async, mutacija je sinhrona):

```ts
eventBus.subscribe(EVENT_TYPES.CARDS_UPDATED, (payload) => {
  const ids = payload?.cardIds;
  if (ids && ids.length > 0 && ids.length <= SURGICAL_LIMIT) {
    // 1. Drain persist queue, 2. fetch, 3. dispatch atomic delta
    void persistQueue.cleanup()
      .then(() => import("@/lib/db"))
      .then(({ db }) => db.cards.bulkGet(ids))
      .then((rows) => {
        const fetched = rows.filter((r): r is Card => !!r);
        const fetchedIds = new Set(fetched.map((c) => c.id));
        const deletedIds = ids.filter((id) => !fetchedIds.has(id));
        return cardCommandBus.dispatch({
          type: "applySyncDelta",
          rows: fetched,
          deletedIds,
        });
      });
  } else {
    // Full reload — dispatch koristi global lock
    void persistQueue.cleanup()
      .then(() => import("@/lib/db-queries"))
      .then(({ idbLoadCards }) => idbLoadCards())
      .then((loaded) => {
        const map: Record<string, Card> = {};
        for (const c of loaded) map[c.id] = c;
        return cardCommandBus.dispatch({ type: "replaceAll", map });
      });
  }
});
```

Ključno: `applySyncDelta` unutar bus-a dobija lock NA SVE id-eve koje dotiče. Ako je bilo `patchCard(id)` u toku, bus ga prvo završi pa onda dozvoli sync delti da prepiše. Stale-fetch problem (V10 patch) sada se rješava sistemski — sync delta se ipak primjenjuje, ali je serijalizovana iza in-flight patch-a, tako da nikad ne klobera svježi write.

`updatedAt` guard u repository-ju (`applySyncDelta` već bira newer-by-updatedAt) ostaje kao defense-in-depth, ali više nije primarni mehanizam ispravnosti.

### 4. Drain semantika

`cardCommandBus.drain()` koristi `replaceAll` sa trenutnim snapshot-om (no-op write) da iskoristi global lock kao "drain barrier". Korisno za:
- testove: `await drain()` prije asercija
- quit-handler u `CardStateProvider` (zajedno sa `flushReviewLogQueue` + `persistQueue.cleanup`)

### 5. Testovi (`src/test/card-command-bus.test.ts`)

```text
- dispatch_per_id_order: 100 patcheva istog id-a primijenjenih FIFO redom
- dispatch_independent_ids_parallel: dva id-a se ne blokiraju
- multi_id_no_deadlock: dvije bulkPatch komande sa preklapajućim id-evima
- sync_delta_after_inflight_patch: patch zatvori, delta primijeni newer
- replaceAll_drains_everything: globalni lock čeka per-id chains
- error_in_command_doesnt_break_chain: throw u patcheru ne blokira sledeći dispatch
```

### 6. Backward-compat

- `cardRepository` ostaje izvezen i pozivljiv direktno — bus je preferiraini ulaz, repository ostaje za interne potrebe (npr. bootstrap u `useCardBootstrap` koji hidrira store prije nego bilo šta drugo radi).
- Bootstrap nastavlja koristiti `cardRepository.replaceAll` direktno (single-threaded boot phase, prije bilo kakvih effects).

## Files

**Novo:**
- `src/lib/repositories/cardCommandBus.ts`
- `src/test/card-command-bus.test.ts`

**Izmjena:**
- `src/hooks/useCardCRUD.ts` — sve writes kroz `cardCommandBus.dispatch`
- `src/hooks/useCardAnnotations.ts` — `bulkFlagNeedsReview`, `bulkUpdateChapter` kroz bus
- `src/contexts/cards/useCardSyncEffects.ts` — sva tri sync put-a (links, review, CARDS_UPDATED) kroz bus
- `src/contexts/cards/CardStateProvider.tsx` — quit handler poziva i `cardCommandBus.drain()`
- `src/lib/repositories/cardRepository.ts` — dodaje JSDoc napomenu da se preferira bus put

## Risk / Migration

- **Async ripple**: `patchCard` je sad `Promise<Card | undefined>`. Pozivaoci trenutno ne await-uju — vraćamo Promise ali zadržavamo void-friendly use (sinhrono dispatch + chain). Konsumenti koji koriste povratnu vrijednost (`splitCard` prije bulk delete) mogu ostati sinhroni jer komande za RAZLIČITE id-eve idu paralelno; ako hoćemo strict ordering, `await dispatch` je dovoljan.
- **Boot order**: `useCardSyncEffects` mora se montirati POSLIJE `useCardBootstrap` postavi `replaceAll` — već je tako u `CardStateProvider`.
- **Test runtime**: jedini failing test (zettelkasten-wiki-link) je pre-existing i ne dotiče card sloj.

Posle approve-a, idem direktno u implementaciju i pokrećem test suite.
