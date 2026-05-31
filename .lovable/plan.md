# PR-G6 (RC-6): Memoizacija — `CardViewTable` row extraction

Cilj: eliminisati O(N×M) per-render trošak u tabeli kartica (Edit tab) gdje
je svaki red rebuild-ovao taksonomske lookup-e (`allCategories.find(...)` +
`.flatMap(...).find(...)`) unutar inline IIFE, a promjena state-a jednog
reda (expand/select/freq menu) trigerovala render SVIH redova.

## Izmjene

### 1. `src/components/category/CardTableRow.tsx` (novo)
- Sav red-level UI prebačen iz inline `filteredCards.map(...)` body-ja u
  zasebnu komponentu.
- `React.memo` sa custom komparatorom koji poredi `card`, `card.updatedAt`,
  `isExpanded`, `isSelected`, `selectionMode`, `taxonomy` (referencno) i
  sve handler reference.
- Prima već **razrijeđene primitive**: `subName`, `subStale`, `chapName`,
  `chapStale` (tip `CardTaxonomyResolved`) — bez pristupa
  `allCategories[]` iznutra.

### 2. `src/components/category/CardViewTable.tsx` (refactor)
- Inline IIFE-i izbrisani.
- Jedan `useMemo` gradi dvije lookup mape iz `allCategories`:
  `subNameById: Map<string, string>`, `chapNameById: Map<string, string>`.
  Trošak O(N) jednom po promjeni `allCategories` umjesto O(N×M) per render.
- Drugi `useMemo` mapira `cardId → CardTaxonomyResolved` koristeći lookup
  mape; referenca svake `taxonomy` vrijednosti je stabilna dok se
  taksonomija ne promijeni, što omogućava da `React.memo` komparator
  preskoči red.
- Delegira render na `<CardTableRow />`.

### 3. Regresioni test `src/test/pr-g6-card-table-row.test.ts`
- Runtime memo guard za `CardTableRow`.
- Statički guard: `CardViewTable.tsx` više NE sadrži
  `allCategories.find(` niti `.subcategories?.flatMap(`.
- Sanity: prisutni su `subNameById` / `chapNameById` i `<CardTableRow />`.

## Što PR-G6 NE radi

- Ne uvodi virtuelizaciju u `CardViewTable` — `CardList` (drugi vidžet)
  je već virtualizovan (mem://ui/card-list-ux), a Edit-tab tipično prikazuje
  manje od 200 redova; row-level memoizacija je glavni win.
- Ne dira `OrgSubcategoryPanel` / DnD (pokriveno u PR-G5).
- Ne mijenja public API `CardViewTable`-a — `Props` interface identičan.

## Verifikacija

- `bunx tsc --noEmit` — 0 grešaka.
- `bunx vitest run pr-g4 pr-g5 pr-g6` — 15/15 ✓ (svi prethodni guard-i
  zadržani).
