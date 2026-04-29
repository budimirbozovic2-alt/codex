## Cilj

U `SubjectCardsView` (Manage tab → "Uređivanje i dodavanje" sub-mode) dodati **hijerarhijsku tree-navigaciju** sa lijeve strane koja prikazuje organizacionu strukturu predmeta (Predmet → Potkategorije → Glave) i sinhronizovana je sa `useCardViewFilters` — klik na čvor odmah filtrira `CardList` desno, sve unutar istog taba (bez prelaska u "Struktura i raspored" ili "Pasivno čitanje").

## Šta korisnik vidi

```text
┌──── Manage tab → "Uređivanje i dodavanje" ────────────────────────┐
│                                                                    │
│  ┌─ Tree (sticky, ~260px) ─┐  ┌─ Postojeći filter bar ─────────┐  │
│  │ ▾ Sve kartice    [142] │  │ [pretraga] [izvor] [tip] [tag] │  │
│  │   ▾ Obligaciono   [54] │  └────────────────────────────────┘  │
│  │     • Opšti dio   [21] │  ┌─ CardList (CardViewTable) ─────┐  │
│  │     • Ugovori     [33] │  │ … virtualizovane kartice …      │  │
│  │   ▸ Stvarno pravo [88] │  │                                 │  │
│  └─────────────────────────┘  └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

- Korijen "Sve kartice" — resetuje `filterSubcategory` i `filterChapter`.
- Potkategorija — kliknena postavlja `filterSubcategory`, briše `filterChapter`.
- Glava — kliknuta postavlja oboje (`filterSubcategory` + `filterChapter`).
- Bedževi pored svakog čvora pokazuju broj kartica (već imamo `subcategoryCounts` i `chapterCounts` iz `useCardViewFilters`).
- Trenutno selektovan čvor je vizuelno istaknut (`bg-primary/10 text-primary border-l-2 border-primary`).
- Expand/collapse strelicom uz ikonu (`ChevronRight`/`ChevronDown`); stanje proširenosti se pamti per-kategorija u `localStorage` (kao i u `PassiveReader`).
- Postojeći `CardViewFilterBar` Select-ovi za potkategoriju/glavu **ostaju** (radi para "tree = primary, dropdowns = backup"), ali su uvijek u sinhronu jer dijele isti `useCardViewFilters` state.

## Tehničke izmjene

### 1. Nova komponenta `src/components/category/SubjectHierarchyTree.tsx`

Prezentaciona, kontrolisana komponenta. Props:

```ts
interface Props {
  subcategoryNodes: SubcategoryNode[];
  totalCount: number;
  subcategoryCounts: Record<string, number>;
  chapterCounts: Record<string, number>;
  selectedSubcategoryId: string;   // "__all__" | uuid
  selectedChapterId: string;       // "__all__" | uuid
  onSelectAll: () => void;
  onSelectSubcategory: (subId: string) => void;
  onSelectChapter: (subId: string, chapterId: string) => void;
  storageKey: string;              // npr. `subj-tree-expanded:${categoryId}`
}
```

- Renderuje `<nav role="tree">` sa pravilnim ARIA atributima (`role="treeitem"`, `aria-expanded`, `aria-selected`, `aria-level`).
- Lazy init expanded set iz `localStorage[storageKey]`; persistira na svaki toggle.
- Auto-expand parent potkategorije ako je `selectedChapterId` njen — tako tree uvijek pokazuje aktivnu selekciju.
- Klavijatura: `ArrowDown/Up` pomijera fokus, `ArrowRight/Left` proširuje/skuplja, `Enter`/`Space` selektira.

### 2. Integracija u `src/components/category/CardViewMode.tsx`

- Promijeniti glavni layout iz `space-y-3` u responzivni grid:
  ```tsx
  <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <SubjectHierarchyTree ... />
    </aside>
    <div className="space-y-3 min-w-0">
      <CardViewFilterBar .../>
      ...
      <CardViewTable .../>
    </div>
  </div>
  ```
- Tree dobija dodatne podatke iz već postojećeg `filters`:
  - `selectedSubcategoryId={filters.filterSubcategory}`
  - `selectedChapterId={filters.filterChapter}`
  - `onSelectAll={() => { filters.changeSubcategory("__all__"); }}`
  - `onSelectSubcategory={(id) => filters.changeSubcategory(id)}`
  - `onSelectChapter={(subId, chId) => { filters.changeSubcategory(subId); filters.setFilterChapter(chId); }}`
- `subcategoryNodes` se prosljeđuje iz `SubjectCardsView` (već postoji), kao novi prop u `CardViewMode`.

### 3. Prosljeđivanje propa kroz `SubjectCardsView.tsx`

U `<CardViewMode ... />` (linija ~294) dodati `subcategoryNodes={subcategoryNodes}`.

### 4. `useCardViewFilters` — bez promjene

Već vraća sve potrebno: `filterSubcategory`, `filterChapter`, `changeSubcategory`, `setFilterChapter`, `subcategoryCounts`, `chapterCounts`, `nameMap`. Tree samo čita i poziva ove iste settere — full sync sa Select dropdownima dolazi besplatno.

### 5. Mobilni / uski viewport

Na ekranima `<lg`, tree se pojavi iznad FilterBar-a kao kolapsibilni `<details>` blok ("Struktura predmeta") — ne zauzima dragocjeni prostor na uskom desktop layoutu. (Memorija kaže pure desktop, pa je ovo edge case za usku Electron prozor širinu.)

## Fajlovi

- **Novo:** `src/components/category/SubjectHierarchyTree.tsx`
- **Izmijenjeno:** `src/components/category/CardViewMode.tsx` — grid layout, prop `subcategoryNodes`, render Tree-a.
- **Izmijenjeno:** `src/views/SubjectCardsView.tsx` — proslijeđen `subcategoryNodes` prop u `CardViewMode`.

## Van opsega

- Drag & drop u tree-u (memorija: D&D je zabranjen van CardOrgMode).
- Promjene u "Struktura i raspored" sub-modu — ostaje nepromijenjen.
- Tree u Pasivnom čitanju — već postoji svoj filter (Select), ne mijenja se ovdje.
- Brisanje postojećih Select dropdownova u `CardViewFilterBar` — namjerno se zadržavaju kao backup/explicit kontrola; tree i dropdowni su uvijek u sinhronu.