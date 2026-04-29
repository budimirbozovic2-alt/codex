
## Cilj

1. Ukloniti suvišne dropdown filtere "Potkategorija" i "Glava" iz Edit prikaza kartica — filtriranje po strukturi se već radi kroz lijevi stablo-panel (`SubjectHierarchyTree`), pa su dropdownovi duplikat.
2. Prikaz kartica u tabeli mora pratiti redoslijed definisan u **Strukturi predmeta** (Manage → Struktura, `CardOrgMode`), tj. po `card.sortOrder` unutar (subcategoryId, chapterId), zatim po vremenu kreiranja kao tie-breaker.

## Šta se mijenja

### A. `src/components/category/CardViewFilterBar.tsx`
- Ukloniti dva `<Select>` bloka: "Potkategorija" (linije 52–64) i "Glava" (66–78).
- Iz `Props` ukloniti polja: `filterSubcategory`, `onChangeSubcategory`, `filterChapter`, `onChangeChapter`, `uniqueSubcategories`, `subcategoryCounts`, `uniqueChapters`, `chapterCounts`, `nameMap`. Zadržati ostalo (tip, tag, mastery, akcioni dugmadi).
- Ako više nema nijednog dropdowna ostaje samo `Filter` ikona + tip/tag/mastery — zadržati layout.

### B. `src/components/category/CardViewMode.tsx`
- Ukloniti propse koje više ne idu u `CardViewFilterBar` (subcategory/chapter dropdown podaci) — i dalje se prosljeđuju u `SubjectHierarchyTree` jer tamo i dalje treba.
- Ne dirati `useCardViewFilters` poziv — `filterSubcategory`/`filterChapter` ostaju kao interno stanje koje se sada postavlja **isključivo** klikom na stablo.

### C. `src/hooks/useCardViewFilters.ts`
- Logika filtriranja po `subcategoryId`/`chapterId` ostaje (klikovi u stablu). 
- `filteredCards` `useMemo` dopuniti stabilnim sortiranjem po strukturi:

```text
sort key:
  1. sortOrder (numerički, ako postoji; nedostaje => Number.MAX_SAFE_INTEGER)
  2. createdAt uzlazno (fallback)
  3. id (deterministički tie-breaker)
```

  Sortiranje se primjenjuje **nakon** filtriranja, tako da i puni prikaz ("Sve") i pojedinačna potkategorija/glava poštuju isti redoslijed koji je korisnik podesio u Strukturi.

### D. (Provjera) `CardViewTable`
- Ne mijenja se — već renderuje `filteredCards` u redoslijedu kako stignu.

## Šta se NE mijenja

- `SubjectHierarchyTree` (lijevi panel) — ostaje glavni način filtriranja po strukturi.
- `CardOrgMode` i DnD logika u `useCardOrgDnd` — već piše `sortOrder` na karticu, pa nije potrebno ništa novo.
- DB schema, persistence queue, ostale faze plana.

## Tehnički detalji sortiranja

`Card` već ima `sortOrder?: number` (vidljivo u `spaced-repetition.ts:193`). DnD u `useCardOrgDnd` postavlja `sortOrder = i` per chapter container, a prilikom premještanja u novi chapter privremeno `sortOrder = 9999`. To je dovoljno da se redoslijed iz Strukture preslika u glavni Edit prikaz.

Sort comparator (pseudokod):
```ts
const so = (c: Card) => (typeof c.sortOrder === "number" ? c.sortOrder : Number.MAX_SAFE_INTEGER);
arr.sort((a, b) => so(a) - so(b)
  || (a.createdAt ?? 0) - (b.createdAt ?? 0)
  || a.id.localeCompare(b.id));
```

## Rizici / kompatibilnost

- Stari nalozi mogu imati kartice bez `sortOrder` — one padaju na kraj, ali se i dalje stabilno sortiraju po `createdAt`/`id`. Korisnik ih može urediti u Strukturi.
- Izlaz: sve postojeće funkcije (pretraga, tip, tag, mastery, izvor) i dalje rade.

## Datoteke

- `src/components/category/CardViewFilterBar.tsx` — uklanjanje dropdownova i propsa.
- `src/components/category/CardViewMode.tsx` — uklanjanje proslijeđenih propsa za uklonjene dropdownove.
- `src/hooks/useCardViewFilters.ts` — sort `filteredCards` po `sortOrder`.
