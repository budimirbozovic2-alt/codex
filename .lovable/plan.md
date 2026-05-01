## Problem

Filtri u "Pregled i Uređivanje" (CardViewMode) — `subcategory`, `chapter`, `type`, `tag` — žive kao lokalni `useState` unutar `useCardViewFilters`. Kada korisnik klikne "Uredi" na kartici, `SubjectCardsView` navigira na `/edit`, `CardViewMode` se demountira, a po povratku se remountira sa default vrijednostima (`__all__`, `"all"`, `null`). Filtri se gube.

`SubjectCardsView` već koristi postojeći `useEditReturn` snapshot-mehanizam za `tab`, `manageMode`, `searchQuery`, `sourceFilter`. Treba dodati i unutarnje CardViewMode filtre u isti snapshot.

## Plan (3 male, surgical izmjene; bez refaktorisanja arhitekture)

### 1. `src/hooks/useCardViewFilters.ts`
- Dodati opcionalna polja u `UseCardViewFiltersParams`: `initialSubcategory`, `initialChapter`, `initialType`, `initialTag`.
- Inicijalizovati 4 `useState` poziva tim vrijednostima (sa fallback-om na trenutne defaultove).
- Bez ostalih izmjena u logici.

### 2. `src/components/category/CardViewMode.tsx`
- Proširiti `Props` sa: `initialSubcategory?`, `initialChapter?`, `initialType?`, `initialTag?`, i `onFiltersChange?: (snapshot: { subcategory: string; chapter: string; type: FilterTypeValue; tag: string | null }) => void`.
- Proslijediti `initial*` u `useCardViewFilters`.
- `useEffect` koji poziva `onFiltersChange` kad god se promijene `filters.filterSubcategory/Chapter/Type/Tag` — parent dobija live snimak tekućih filtera.

### 3. `src/views/SubjectCardsView.tsx`
- Proširiti `EditReturnSnapshot`: dodati `cvSub?`, `cvChapter?`, `cvType?`, `cvTag?`.
- Držati `useRef` (`cardViewFiltersRef`) sa najnovijim vrijednostima koje šalje `CardViewMode` preko `onFiltersChange`.
- U `buildExtras` dodati polja iz refa.
- Proslijediti `initialSnapshot?.cv*` kao `initial*` props prema `<CardViewMode />`.

## Što ostaje van obima

- `masteryFilter` se već pamti na višem nivou (ne resetuje se).
- `searchQuery` i `sourceFilter` su već u snapshotu.
- Bez perzistencije u localStorage (snapshot je per-edit-session, čisti se sam — to je željeno ponašanje).
