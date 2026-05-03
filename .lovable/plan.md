
# Ukloniti filter po izvorima iz pregleda kartica

## Cilj
Ukloniti `Select` "Izvor" iz toolbar-a u `SubjectCardsView` (Manage/Edit) i sve prateće mehanizme — postaje suvišan jer kartice već imaju subcategory/chapter/type/frequency/search filtere i hijerarhijsko grupiranje.

## Izmjene

### 1. `src/views/SubjectCardsView.tsx`
- Ukloniti import `useCategorySources` (linija 15) i poziv `const sources = useCategorySources(categoryId)` (linija 122).
- Ukloniti `usedSourceIds` (130-134) i `sourceOptions` (136-139) memo blokove — više nemaju potrošača.
- Ukloniti `sourceFilter?: string` polje iz `EditReturnSnapshot` (linija 38) i sve reference: `sourceFilter` u `buildExtras` (103), `useState` deklaraciju (121).
- Ukloniti `<Select value={sourceFilter} ...>` blok iz toolbara (linije 342-356).
- Ukloniti prop `externalSourceId={sourceFilter}` sa `<CardViewMode>` (linija 372).

### 2. `src/components/category/CardViewMode.tsx`
- Ukloniti `externalSourceId?: string` iz `Props` (linija 39).
- Ukloniti `externalSourceId` iz destrukturiranja parametara (49) i iz objekta proslijeđenog `useCardViewFilters({...})` (65).

### 3. `src/hooks/useCardViewFilters.ts`
- Ukloniti `externalSourceId?: string` iz `UseCardViewFiltersParams` (32).
- Ukloniti destrukturirani parametar (61).
- Ukloniti `sourceFilterActive` i provjeru `card.sourceId !== externalSourceId` iz `filteredCards` filtera (101, 108) i deps (127).
- Ukloniti grane vezane za `externalSourceId` u `hasActiveFilters` (136) i deps (138).

## Bez izmjena
- `useCategorySources` hook ostaje (koristi ga `CategoryView`).
- Logika `card.sourceId` nije dirana na podacima — samo se UI filter uklanja.
- Edit-return snapshot ostali ključevi (`searchQuery`, `cv*`) ostaju.

## Acceptance
- Toolbar u Manage/Edit modu prikazuje samo `Search` input.
- Nakon edit-and-return, ostali filteri (search, subcat, chapter, type, frequency) i dalje se vraćaju.
- TypeScript prolazi čisto.
