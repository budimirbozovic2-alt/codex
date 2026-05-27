# B1 — cardRepository Collapse

## Recon napomena (važno — odstupanje od originalnog brifa)

Tvoj brief kaže: „AppContext projection (categoryRecords) gradi se iz QueryClient cache snapshot-a kroz selektor hook `useCategoryRecords`." To **ne stoji** za trenutno stanje:

- `categoryRecords` se gradi u `src/contexts/cards/CategoryStateProvider.tsx` iz Zustand `categoryStore` (`useSyncExternalStore`), **ne** iz `cardRepository`.
- `cardRepository` ne učestvuje u kategorijskoj projekciji. Ono što stvarno drži je: in-RAM `cardMapStore` commit-i, `schedulePersist`, coverage cache invalidacija, `sameSourceModules` diff i `reloadFromIdb`.

Zaključak: B1 se ograničava na razbijanje `cardRepository.ts` sloja. `categoryRecords` ostaje netaknut — to spada u zasebni A-pravac (npr. A1c kad migriramo `categoryStore` na QueryClient).

## Stanje poslije M3

Aktivni call-site-ovi `cardRepository`-ja:

| Caller | Šta poziva |
|---|---|
| `useCardMutations.ts` (M3) | `putAsync / bulkPutAsync / removeAsync / patchAsync / bulkPatchAsync / reloadFromIdb` |
| `useCardCRUD.ts` | `cardRepository.get(id)` (jedan sync lookup) |
| `useCardImport.ts` | `replaceAll`, `bulkPut` |
| `useCategoryManagement.ts` | `applySyncDelta`, `bulkPut`, `bulkPatch` |
| `useCardSyncEffects.ts` | `clearLinks`, `clearNeedsReview` |
| `useCardBootstrap.ts` | `replaceAll` |
| `useHealthMonitor.ts`, `RemapFromBackupDialog.tsx` | `reloadFromIdb` |
| `lib/editor-v4/lazy-migrate.ts` | `snapshot`, `bulkPut` |

Cilj: ukloniti repo objekat, ostaviti čist data-flow `UI → useMutation → queries/* (SQLite) → notify → useQuery`.

## Plan

### 1. Novi modul: `src/lib/cards/cardMapWrites.ts`

Preseliti **sve sync primitive** iz `cardRepository.ts` 1:1 kao named exports — bez agregatnog objekta:

```text
getCard, snapshot
put, bulkPut, remove, patch, bulkPatch
clearLinks, clearNeedsReview
applySyncDelta, replaceAll
```

Interni `commitSingle / commitBulk / commitDelete` ostaju privatni helperi. Svaki commit i dalje radi `schedulePersist` + `setCardMap` + `notifyCardsChanged`. Coverage-cache invalidacija ostaje u `remove` i `patch` (logika nepromenjena, samo nova lokacija).

### 2. `reloadCardsFromIdb` → standalone

Preseliti u isti modul (`cardMapWrites.ts`) kao named export. Sekvencer (`_fetchSequence`) ostaje lokalni, surgical/full grana nepromenjena. Koristi `listAllCards` / `getCardsByIds` iz `@/lib/db/queries`.

### 3. Async WriteResult wrappers → inline u `useCardMutations.ts`

`putAsync / bulkPutAsync / removeAsync / patchAsync / bulkPatchAsync` imaju **samo jednog konzumenta** (M3 `useCardMutations`). Umesto da postoje kao zasebni sloj, `mutationFn` direktno radi:

```text
mutationFn: (card) => wrapWrite(async () => {
  cardMapWrites.put(card);
  await persistQueue.cleanup();
  return card;
})
```

Time async sloj nestaje iz repository „API"-ja i sjedinjuje se sa mutation hook-om.

### 4. Repoint imports

Svaki call-site dobija nove import putanje:

```text
useCardCRUD            → import { getCard } from "@/lib/cards/cardMapWrites"
useCardImport          → { replaceAll, bulkPut }
useCategoryManagement  → { applySyncDelta, bulkPut, bulkPatch }
useCardSyncEffects     → { clearLinks, clearNeedsReview }
useCardBootstrap       → { replaceAll }
useHealthMonitor       → { reloadCardsFromIdb }
RemapFromBackupDialog  → { reloadCardsFromIdb }
lazy-migrate           → { snapshot, bulkPut }
useCardMutations       → { put, bulkPut, remove, patch, bulkPatch } (+ inline async wrappers)
```

### 5. Brisanje + ESLint zid

- Obrisati `src/lib/repositories/cardRepository.ts`.
- Iz `src/lib/repositories/index.ts` ukloniti `export { cardRepository, reloadCardsFromIdb }` red.
- ESLint Public API Wall (`eslint.config.js`):
  - skinuti deprecated pravilo za deep-import `@/lib/repositories/cardRepository`;
  - **dodati** novi zid: `@/lib/cards/*` se sme importovati iz bilo gde (write primitive sloj), ali interni helperi se ne re-eksportuju kroz `@/lib/repositories`.
- Verifikacija: `bun run lint` + targeted `tsc --noEmit` (run-uje ga harness, ne mi).

### 6. Test

- `src/test/card-repository-delete.test.ts`:
  - Ako pokriva isti put kao postojeći M3 mutation test (`useCardMutations.deleteCard` → SQLite delete + RAM evict) → **obrisati** (redundantno).
  - Ako pokriva nešto jedinstveno (npr. coverage-cache invalidaciju na delete) → portati na `useCardMutations.deleteCard.mutateAsync(id)` i preimenovati u `card-mutations-delete.test.ts`.
- Smoke pass: postojeći `card-selectors`, `use-cards-by-source` testovi treba da prođu bez izmena (čitaju iz `cardMapStore`-a koji nije pomeren).

### 7. Memory update

`mem://architecture/sqlite-ssot-cutover` — dopisati:

> `cardRepository` sloj uklonjen. Sync RAM commit-i žive u `@/lib/cards/cardMapWrites`. Async writes idu isključivo kroz `useCardMutations` (TanStack). `reloadCardsFromIdb` je standalone helper u istom modulu.

## Tehnički detalji

- `cardMapWrites.ts` ostaje **čist od React-a** i čisto sinhron osim `reloadCardsFromIdb` — može da se importuje iz hookova i iz `lazy-migrate` skripte.
- `WriteResult` shape iz `@/lib/persistence/write-result` ostaje neizmenjen; `wrapWrite` se sada poziva iz `useCardMutations` direktno.
- Nema promene u `persist-queue` ni `cardMapStore` API-ju — samo seljakanje thin sloja.
- `categoryRecords` ostaje izvan scope-a (vidi recon napomenu).

## Net izlaz

- Obrisano: `src/lib/repositories/cardRepository.ts` (~304 LOC) + agregatni objekat.
- Dodato: `src/lib/cards/cardMapWrites.ts` (~180 LOC sync primitive + reload) — neto **~120 LOC manje**, jedan agregatni sloj eliminisan.
- Data-flow: `UI → useMutation → wrapWrite(cardMapWrites + persistQueue) → SQLite + notify → useQuery / store`.
