## Cilj

Smanjiti broj re-fetcheva i re-rendera tokom bursta `notifyCardsChanged()` (bulk import, FSRS grade-many, restore, taxonomy migracije) tako što:

1. **Per-scope debounce** — koalesciramo izmjene u **Set tačnih query ključeva** (`['cards','cat',X]`, `['cards','source',Y]`, …) umjesto da uvijek invalidiramo cijeli `['cards']` prefix. Consumeri koji nisu pogođeni ne refeta-uju.
2. **Max-wait cap** — pod dugim, kontinuiranim burstom (npr. 30s bulk import koji emituje notifikacije svakih par ms) trailing debounce nikad ne istekne. Dodajemo hard cap (250ms) — ako se prozor stalno resetuje, flush se ipak izvrši.

Fallback ostaje siguran: poziv bez scope payload-a (`notifyCardsChanged()` bez argumenta) i dalje proizvodi **prefix invalidaciju** (`['cards']`). Postojeći call-site-ovi rade bez izmjene.

## Promjene

### 1. `src/lib/db/queries/cards.ts` — proširi event API

```ts
export type CardsScope =
  | { kind: "all" }                                    // prefix invalidate
  | { kind: "category"; categoryId: string }
  | { kind: "subcategory"; categoryId: string; subcategoryId: string }
  | { kind: "chapter"; categoryId: string; chapterId: string }
  | { kind: "source"; sourceId: string }
  | { kind: "ids"; categoryIds?: string[]; sourceIds?: string[] }; // bulk pošalje skupove

export type CardsChangedListener = (scope: CardsScope) => void;

export function notifyCardsChanged(scope: CardsScope = { kind: "all" }): void { … }
```

`onCardsChanged` ostaje, samo callback dobija `scope`. Stari pozivi (`notifyCardsChanged()`) ostaju validni.

### 2. `src/lib/query/bridges.ts` — per-scope debouncer + max-wait

```text
window = 16ms trailing  (postojeće — kratki burst → 1 frame)
maxWait = 250ms hard cap  (dug burst → flush forsiran)
```

Stanje:
- `_pendingKeys: Set<string>` — serijalizovani query ključevi (`JSON.stringify`).
- `_pendingPrefix: boolean` — ako iko emituje `{kind:"all"}`, kolapsiramo na prefix flush.
- `_trailingTimer`, `_maxWaitTimer`.

Algoritam (`scheduleCardsInvalidate(qc, scope)`):
1. Ako `scope.kind === "all"` → `_pendingPrefix = true; _pendingKeys.clear()`.
2. Inače, dodaj sve odgovarajuće `queryKeys.cards.*` u `_pendingKeys` (npr. za `kind:"category"` dodaj `byCategory`, `countByCategory`; za `kind:"ids"` map-uj svaki id).
3. `clearTimeout(_trailingTimer); _trailingTimer = setTimeout(flush, 16)`.
4. Ako `_maxWaitTimer === null` → `_maxWaitTimer = setTimeout(flush, 250)`.

`flush()`:
- Clear oba timera.
- Ako `_pendingPrefix` → `invalidateQueries({ queryKey: ["cards"] })`, isprazni Set.
- Inače → za svaki ključ u Set-u `invalidateQueries({ queryKey: parsed, exact: true })`.

### 3. Pozivaoci — opcionalni upgrade na scoped emit

Bez izmjene rade. Za maksimalnu korist mijenjamo samo "vrele" pozive:

- `cards-bulk-mutations.ts` (A2) — već zna `categoryId`/`subcategoryId`/`chapterId` → emit `{kind:"category"|"subcategory"|"chapter", …}`.
- `cardRepository.put/bulkPut/delete` u `cardMapWrites.ts` — emit `{kind:"ids", categoryIds:[…], sourceIds:[…]}` (zna iz upisane kartice).
- `category-deletion-service.ts` — emit `{kind:"category", categoryId}`.
- `useCardBootstrap.ts` heal → emit `{kind:"all"}` (eksplicitno, jer dira sve scope-ove).

Ostali pozivi (kojih nema mnogo) ostaju `{kind:"all"}` defaultom.

### 4. Test seam

- Proširi `_flushCardsInvalidateForTest()` da gasi oba timera i isprazni Set.
- Dodaj export `_getPendingCardsKeysForTest()` za inspekciju.

### 5. Testovi (`src/test/query-bridges.test.ts` proširi)

- Postojeći "100 notify → 1 invalidate" test ostaje (sve unscoped) — pokriva prefix kolaps.
- Novi: 50 `notify({kind:"category", categoryId:"A"})` + 50 `notify({kind:"category", categoryId:"B"})` → tačno 2 `invalidateQueries` poziva sa `exact:true`, nijedan prefix.
- Novi: mix `{kind:"all"}` + scoped → degraduje na 1 prefix invalidate (escalation).
- Novi (max-wait): emit svakih 10ms x 30 (300ms ukupno) → trailing se stalno resetuje, ali `flush` se forsira na ~250ms; očekujemo **2** invalidacije (jedan na maxWait, jedan trailing nakon zadnjeg emita).

### 6. Verifikacija

- `tsc --noEmit` clean.
- `bunx vitest run src/test/query-bridges.test.ts src/test/cards-mirror-and-rollback.test.tsx` — svi prolaze.
- Postojeći `cards-mirror-and-rollback.test.tsx` ne mora se mijenjati (koristi `notifyCardsChanged()` bez argumenta → prefix put).

## Memorija

Update `mem://architecture/tanstack-query-read-path` napomena: "cards bridge: per-scope Set debounce (16ms trailing + 250ms max-wait), unscoped emit eskalira na prefix".

## Što NE radim

- Ne dirma se `setQueryData` push mirror (ostaje uklonjen po Phase 2b).
- Ostali bridges (sources/planner/mindMaps/mnemonics/knowledgeBase) ostaju nepromijenjeni — oni nemaju isti burst profil.
