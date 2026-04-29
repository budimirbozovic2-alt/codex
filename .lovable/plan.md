## Kontekst i ograničenja

Projekat **drži sve kartice u memoriji** (`cardMap` SSOT u `AppContext`, per memory rule "No useLiveQuery in primary views"). Zato Dexie indeksi **ne ubrzavaju** filtere u render path-u — oni operišu nad već-učitanim `cards: Card[]` array-em. Ono što novi v15 indeksi (`chapterId`, `[categoryId+chapterId]`, `[subcategoryId+chapterId]`) **stvarno mogu** da ubrzaju:

- Bootstrap fetch (jednom po boot-u, već optimalan jer ide `toArray()`).
- One-shot operacije: HealthMonitor, AutoSplit verifikacija, Source unlinking, mass-delete na brisanje kategorije.

Ali **najveći win za render-time u preview-u** dolazi od **JS-side optimizacija nad in-memory `cards` array-om** koje preslikavaju logiku indeksa: izbjegavanje O(N) `.filter()` lanaca tako što napravimo **memoizovane bucket mape** (`Map<categoryId, Card[]>`, `Map<subcategoryId, Card[]>`, `Map<chapterId, Card[]>`) jednom po promjeni `cards`, pa svako sub-stablo (Subject Dashboard, useSourceHierarchy, ReviewSetup, useCardViewFilters) čita iz njih u O(1) lookup + O(K) iteracije gdje je K = veličina bucket-a, ne ukupan broj kartica.

## Hot path audit (mjereno mjesto u render-u)

| Mjesto | Trenutno | Problem |
|---|---|---|
| `SubjectDashboard.subProgressData` | `cards.filter(c=>c.categoryId===id)` zatim **po subcategory pa po chapter** ugnježđeni filteri | O(N × S × C) prolaza nad globalnim `cards` |
| `useSourceHierarchy` | jedan prolaz, već OK (gradi `bySub`/`chapMap`) | OK, ali ponavlja se za svaku subject view promjenu |
| `useCardViewFilters` | O(N) filter po categoryId + subcategoryId + chapterId | može iz pre-bucket-a |
| `useCardListFilters` | O(N) filter, isto | isto |
| `ReviewSetup` (`filteredDueCards`, `filteredAllCards`) | dva odvojena O(N) filter lanca | može iz pre-bucket-a |
| `SubjectCardsView/PassiveReader` | O(N) filter | isto |
| `LearnSession` setup | O(N) filter | isto |

**Render benefit u preview-u**: za korisnika sa 9 predmeta × ~500 kartica/predmet = 4500 ukupno, prelazak sa "linearno skeniraj 4500 svaki put kad otvoriš dashboard" na "uzmi 500 iz bucket-a po `categoryId`" je 9× speedup na svaki re-render. SubjectDashboard `subProgressData` koji unutra radi 3 ugniježđena `.filter`-a — trenutno O(N × subs × chaps), nakon — O(K_cat) za jedan bucket lookup pa O(K_sub) lokalno.

## Planirane izmjene

### 1. Novi util: `src/lib/card-buckets.ts`

Memoizable indeks-strukture nad `Card[]`. Čista funkcija (ne hook), pa može da se reuse-uje i u `useMemo` i u worker-ima/migracijama.

```ts
export interface CardBuckets {
  byCategory: Map<string, Card[]>;
  bySubcategory: Map<string, Card[]>;
  byChapter: Map<string, Card[]>;
  byCategoryChapter: Map<string, Card[]>;     // key = `${catId}::${chapId}`
  bySubcategoryChapter: Map<string, Card[]>;  // key = `${subId}::${chapId}`
}
export function buildCardBuckets(cards: Card[]): CardBuckets;
export const compositeKey = (a: string, b: string) => `${a}::${b}`;
```

Single pass O(N) gradnja. Zamjenjuje N×N (filter + nested filter) sa N + lookups.

### 2. AppContext — izloži pre-bucketed view kroz selektor hook

Dodati u `useCardData()` (ili novi `useCardBuckets()`) memoizovan rezultat `buildCardBuckets(cards)`. Recompute samo kad se `cards` reference mijenja (već je Ref-Delta pa je promjena retka).

### 3. Refactor pozivnih mjesta (najveći payoff prvo)

- **`SubjectDashboard.subProgressData`** — koristiti `buckets.byCategory.get(categoryId) ?? []` umjesto `cards.filter(...)`, pa unutar petlje subcategorija `buckets.bySubcategory.get(sub.id) ?? []` i `buckets.byChapter.get(ch.id) ?? []` (uz dodatni `categoryId` provjeru za kolizije UUID-a, mada UUID-ovi su unique).
- **`useSourceHierarchy`** — `cards.filter(c=>c.categoryId===category)` → `buckets.byCategory.get(category) ?? []`.
- **`useCardViewFilters` / `useCardListFilters`** — startuj od najužeg dostupnog bucket-a (chapter > subcategory > category > all), pa primijeni preostale filtere (type, freq, search) tek nad tim manjim setom.
- **`ReviewSetup.filteredDueCards/AllCards`** — isto, kreni od najužeg bucket-a.
- **`PassiveReader`, `LearnSession`** — isto.

### 4. (Sitno čišćenje) `db-queries.ts`

`idbCountCardsByCategory`, `idbCountByType`, `idbCountAllCards` su **dead code** (nigdje se ne pozivaju). Ako ih ostavimo, idu na novi `[categoryId+...]` indeks gdje je primjenjivo. Predlažem: **ostaviti** kao dokumentovan public API za buduće non-bootstrap query-je (npr. badge counter koji ne traži cijelu listu) — bez promjena.

### 5. (Out of scope) Direktna IDB optimizacija

Ne mijenjamo `db.cards.toArray()` u bootstrap-u na `where(...).toArray()` jer bootstrap već učitava sve kartice u memoriju (to je SSOT model). Indeksi tu **niti pomažu niti smetaju**. Postojeći v15 indeksi su tu za eventualne buduće on-demand IDB query-je (npr. statistike po chapter-u bez učitavanja svega).

## Tehnički detalji

- **Memoizacija**: `buildCardBuckets` se zove kroz `useMemo([cards])` u kontekstu — jedan trošak po cards-update batch-u, koristi ga N konzumenata.
- **Mutation safety**: vraćamo nove `Map` instance na svaki rebuild (referencijska jednakost = OK signal za React memo). Ne mutiramo postojeće.
- **Tail handling**: kartice bez `subcategoryId`/`chapterId` ne završavaju u tim bucket-ima — pozivna mjesta već znaju da rade fallback (npr. `__ostalo__` u `useSourceHierarchy`); zadržavamo isti contract.
- **Composite key**: koristimo string `"${a}::${b}"` umjesto nested Map-a — jednostavnije i brže za V8 string-keyed Map.
- **Memory cost**: 5 dodatnih Map-a × po N pointer-a = ~40 bajtova × 4500 × 5 ≈ 1 MB heap-a za realne baze. Trivijalno u odnosu na 200+ MB koji TipTap+ReactFlow drže.

## Fajlovi

**Novi**:
- `src/lib/card-buckets.ts` — bucket builder + composite key helper
- `src/test/card-buckets.test.ts` — unit test (svaki bucket, edge case missing IDs)

**Izmjene** (samo lookup paths, bez ponašajnih promjena):
- `src/contexts/AppContext.tsx` (ili `src/hooks/useCards.ts`) — dodati memoizovan `buckets` u `useCardData` return
- `src/views/SubjectDashboard.tsx` — refactor `subProgressData`
- `src/hooks/useSourceHierarchy.ts` — koristiti bucket
- `src/hooks/useCardViewFilters.ts`
- `src/hooks/useCardListFilters.ts`
- `src/components/review/ReviewSetup.tsx` — `filteredDueCards`, `filteredAllCards`
- `src/components/subject-cards/PassiveReader.tsx`
- `src/components/LearnSession.tsx`

## Out of scope (eksplicitno)

- Konvertovanje SSOT-a sa in-memory na `useLiveQuery` — kršilo bi Core memory rule.
- Refactor `HealthMonitor` (radi puni dijagnostički prolaz; tu je full scan namjeran).
- Refactor migracija (`heal-card-taxonomy`, `remap-from-backup`) — one-shot operacije, ne render path.
- Bilo kakva izmjena `db-schema.ts` (već je v15 sa indeksima; ovo je čisto JS-side optimizacija koja preslikava istu hierarhiju koju indeksi predstavljaju u IDB-u).
