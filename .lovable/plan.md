# Pilot: "No more empty blinks" — CategoryView

**Pravac:** Polish & Perception · **Obim:** jedan pilot (1–2 dana) · **Pilot scope:** isključivo `CategoryView`

## Problem koji rješavamo

Trenutno na `CategoryView`:

1. Boot signal `ready` gating renderuje **generic spinner u centru ekrana** dok kartice ne stignu. Layout potpuno nestane.
2. TanStack `useCardsByCategory` (već konzumiran u `src/hooks/card/useCardsQuery.ts`) vraća **`data ?? EMPTY`** — UI ne razlikuje "nema kartica" od "još se učitavaju". Brzo prebacivanje kategorija → **flash prazne liste** prije nego što stignu pravi podaci.
3. Prebacivanje tabova (Kartice / Izvori / …) je instant cut — nema percepcije fluidnosti koju refaktoring (slim provider tree, AST renderer) sada omogućava.

## Cilj

CategoryView nikad ne prikazuje (a) generic spinner, (b) prazan list kao loading state, (c) hard cut između tabova. Sve prelaze ili **layout-shape skeleton** ili **cross-fade view transition**.

## Šta se gradi

### 1. Skeleton primitive `<ListSkeleton>` + `<CategoryHeaderSkeleton>`
Lokacija: `src/components/ui/list-skeleton.tsx` (novi). Koristi postojeći `src/components/ui/skeleton.tsx` kao bazu.
- `<ListSkeleton rows={6} />` — N redova u istoj formi kao `CardViewTable` (avatar krug za retrievability ring + 2 linije teksta + mastery chip).
- `<CategoryHeaderSkeleton />` — mastery distribucija bar + naslov + tab strip placeholders.

### 2. Status-aware varijante query hookova
Lokacija: `src/hooks/card/useCardsQuery.ts` (proširuje, ne mijenja postojeće).
- Dodati `useCardsByCategoryWithStatus(categoryId)` koji vraća `{ cards, isLoading, isFetching }`. Postojeći `useCardsByCategory` ostaje tuple-only za neimpaktovan call-site.
- Analogno `useCategorySourcesWithStatus(categoryId)` u `src/hooks/useCategorySources.ts` (sources isto trenutno crta praznu listu dok ne stignu).

### 3. View Transitions utility
Lokacija: `src/lib/ui/view-transition.ts` (novi).
```ts
export function startViewTransition(fn: () => void): void
```
Wrap oko `document.startViewTransition` sa feature-detect fallbackom (instant cut u Electron ranijim verzijama ako ne podrži; trenutni Electron Chromium ≥111 podrži).

Tab-content shell dobija `style={{ viewTransitionName: 'category-tab-content' }}`. Cross-fade default; trajanje 220ms preko `index.css` (`::view-transition-old/new`).

### 4. CategoryView refactor (samo loading + tab transition)
Lokacija: `src/views/CategoryView.tsx`.
- Zamijeniti `if (!ready)` spinner sa kompletnim `<CategoryHeaderSkeleton /> + <ListSkeleton />` shellom.
- Koristiti `useCardsByCategoryWithStatus` umjesto `useCardsByCategory`. Kad `isLoading && cards.length === 0` → `<ListSkeleton rows={8} />`. Inače renderuj prave kartice (refetch ne blinka).
- Tab change handler: `startViewTransition(() => setActiveTab(next))`.
- **Out of scope** u ovom pilotu: vizuelni redesign sadržaja, novi tabovi, izmjena CardList ponašanja, mutation transitions.

### 5. Test
Lokacija: `src/test/category-view-loading.test.tsx` (novi, ~30 LOC).
- Mount sa odgođenim `cardsByCategory` mockom → očekuj `ListSkeleton` u DOM-u.
- Resolved query → skeleton zamijenjen pravim listom.

## Što NIJE u pilotu (svjesno ograničeno)

- Suspense granice (zahtijeva veće prelome u tree-u — sljedeća iteracija).
- Skeletoni u Zettelkasten, Planner, Subject Cards hubu (isti recept, ali kasniji passevi).
- Animirane tranzicije unutar samog CardList-a (insert/remove).
- Promjena vizuelnog stila bilo kog elementa — pilot je čisto perceptivni layer.

## Acceptance criteria

1. Hladan boot na `/category/:id` URL-u → korisnik vidi mastery-bar + tab strip + 8 row placeholdera, **nikad** centriran spinner.
2. Prebacivanje između dvije kategorije (klik u sidebar-u) → stara lista cross-fade u skeleton ili novu listu; **nema flash-a prazne stranice**.
3. Prebacivanje tabova (Kartice ↔ Izvori) → 220ms cross-fade umjesto hard cut-a (feature-detect fallback OK).
4. `tsc --noEmit` clean, novi test prolazi, postojećih 592+ testova ostaju zeleni.
5. Bundle delta: < +3 KB gzipped (skeleton je par divova + 1 CSS keyframe).

## Tehnička napomena (za poslije pilota)

Ako pilot prođe estetski test, isti tri komponente (`*WithStatus` hook + `<ListSkeleton>` + `startViewTransition`) trivijalno se primjenjuju na:
- `SubjectCardsView` (Edit/Structure tab swap)
- `Dashboard` widget grid
- `PlannerPage` subject plans
- Zettelkasten `ZettelExplorerPanel` article load

Tj. pilot je istovremeno provjera obrasca koji će postati standard za sve liste/tab-switches u aplikaciji.

## Procjena

Ukupno ~250 LOC novog koda + ~80 LOC izmjena. Realno 1 radni dan implementacije + 0.5 dana QA u Electron build-u.
