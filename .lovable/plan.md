## Problem

U `Pregled i Uređivanje` (CardViewMode) kartice se sortiraju **isključivo po `card.sortOrder`** — flat broju koji `CardOrgMode` (Struktura) postavlja **per-poglavlje** (resetuje na 0..N unutar svake glave). Posljedica:

- Kartica iz Glave-A (`sortOrder=0`) i kartica iz Glave-B (`sortOrder=0`) imaju isti ključ → redoslijed između njih je nedeterministički (po `createdAt`/`id`).
- Kartice iz dvije različite glave/potkategorije se **isprepliću** umjesto da budu grupisane redom: cijela Potkategorija 1 → Glava 1.1 → Glava 1.2 → cijela Potkategorija 2 → ...

Trenutno problematični fajlovi:
- `src/hooks/useCardViewFilters.ts` (linije 92–101) — sort samo po `sortOrder`.
- `src/hooks/useCardListFilters.ts` (linije 38–44) — isti pattern, ista greška.

## Cilj

Sortirati liste tako da prate **hijerarhijski raspored Strukture**:

```text
[ subcat.sortOrder, chapter.sortOrder, card.sortOrder, createdAt, id ]
```

Kartice bez subcategoryId/chapterId idu na kraj odgovarajuće grupe (kao "Bez potkategorije" / "Bez glave"), redoslijedom po `sortOrder`/`createdAt`.

## Plan izmjena

### 1. Novi helper: `src/lib/card-ordering.ts`

Centralizovana funkcija koja kompozituje hijerarhijski sort key — koristi je svaki view koji prikazuje liste kartica, da nema dvije implementacije sa različitim ponašanjem.

```ts
export interface HierarchyOrder {
  /** subId → sortOrder (or large fallback if missing) */
  subOrder: Map<string, number>;
  /** chapId → sortOrder (or large fallback if missing) */
  chapterOrder: Map<string, number>;
}

export function buildHierarchyOrder(category: CategoryRecord | null): HierarchyOrder;

export function compareCardsByHierarchy(
  a: Card,
  b: Card,
  order: HierarchyOrder,
): number;
```

Logika `compare`:
1. `subOrder.get(a.subcategoryId)` vs `b` (missing → `MAX_SAFE_INTEGER` → ide na kraj).
2. Ako jednako → `chapterOrder.get(a.chapterId)` vs `b`.
3. Ako jednako → `card.sortOrder` (missing → `MAX_SAFE_INTEGER`).
4. Tie-breakeri: `createdAt`, zatim `id`.

### 2. `src/hooks/useCardViewFilters.ts`
- Dodati `useMemo` koji pravi `HierarchyOrder` iz `allCategories.find(c => c.id === categoryId)`.
- Zamijeniti postojeći sort sa `compareCardsByHierarchy(a, b, order)`.

### 3. `src/hooks/useCardListFilters.ts`
- Isti pattern — primiti category record (već prima `cards` + filtere; treba dodati `categoryRecord` prop ako nije tu, ili izvući iz parametra).
- Pogledati pozivaoce; ako bi propagacija bila preteška, fallback je da hook prima `subOrder`/`chapterOrder` mape direktno.

### 4. Test (smoke)
Brz unit test u `src/test/` koji potvrdi:
- Dvije kartice iz različitih glava sa istim `card.sortOrder=0` se sortiraju po `chapter.sortOrder`.
- Kartice iz Pkat-1/Glave-2 dolaze prije kartica iz Pkat-2/Glave-1.
- Kartica bez chapterId ide na kraj grupe Pkat-1.

## Tehnički detalji / rizici

- **Nema schema migracije** — koristimo postojeća polja (`subcategoryId`, `chapterId`, `sortOrder` na svemu).
- **Performanse** — `HierarchyOrder` je `useMemo` per render kategorije; `compare` je O(1) lookup. Lista do nekoliko hiljada kartica → trivijalno.
- **CardOrgMode (Struktura)** — već renderuje grupisano, pa njegova prezentacija ostaje ista; mijenja se samo flat lista u `Pregled i Uređivanje`.
- **Stara dugmad za sortiranje korisnika nije promijenjena** — manualni DnD i dalje radi unutar grupe, samo što sada ne "curi" preko granica grupa.

## Out of scope

- Ne mijenja se `CardOrgMode` UI niti DnD logika.
- Ne mijenja se LearnSession sort (već koristi svoju logiku za sub/chap pos).
- Ne dodajemo novo polje na karticu — koristimo postojeća.
