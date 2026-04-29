# Izdvajanje scroll + UI restore logike u zajednički hook

## Šta je trenutno duplirano / razbacano

Trenutno se obrazac "stash UI snapshot prije navigacije, restore nakon povratka" pojavljuje na više mjesta sa različitim varijantama:

1. **`src/views/SubjectCardsView.tsx`** (linije 21–138):
   - Definiše lokalni interface `EditReturnSnapshot`.
   - U `useMemo` lazy-čita `consumeEditReturnState`.
   - U `useEffect` (linije 81–105) ručno radi RAF-loop restore scroll-a sa retry-em zbog virtualizovane liste.
   - U `handleEdit` (linije 125–138) ručno gradi snapshot sa `tab/manageMode/searchQuery/sourceFilter/scrollY`, poziva `setEditReturn` + `stashEditReturnState`.

2. **`src/views/LearnPage.tsx:63–67`** — `handleEdit` poziva samo `setEditReturn({ path: "/learn" })` (nema state snapshota).

3. **`src/components/MainLayout.tsx:91–99`** — `onNavigateToCard` poziva samo `setEditReturn({ path: location.pathname + search })`.

4. **`src/views/EditPage.tsx:15–29`** — drži lokalni `returnPathRef` i `navigateBack` koji čita `consumeEditReturn`.

Restore scroll-a sa virtualizovanom listom (ono najsloženije) postoji **samo na jednom mjestu**, ali je dobar kandidat da se izdvoji jer ćemo ga sutra trebati i u ZettelkastenView i drugim listama.

## Cilj

Jedan zajednički hook koji sažima cio "edit-return" obrazac na 3 linije po pozivnom mjestu, plus poseban primitivni hook za "restore scroll u rastućem dokumentu" koji se može nezavisno reuseovati.

## Nova javna površina

### 1) `src/hooks/useScrollRestore.ts` (novo)

Generički RAF-loop scroll restore za rastuće (virtualizovane) dokumente.

```ts
export function useScrollRestore(
  targetY: number | null | undefined,
  opts?: { maxAttempts?: number; behavior?: ScrollBehavior; element?: HTMLElement | null }
): void;
```

- Aktivira se samo kad `targetY` postane broj.
- RAF-loop sa default-om `maxAttempts=8` i `behavior="auto"`.
- Radi na `window` ili na proslijeđenom elementu (za buduće inner-scroll listove).
- Prekida se na unmount preko `cancelAnimationFrame`.

Implementacija je 1:1 prenos postojeće logike iz `SubjectCardsView` 81–105, parametrizovana.

### 2) `src/hooks/useEditReturn.ts` (novo)

Visoko-nivovski hook koji enkapsulira cio life-cycle "stash → navigate to /edit → restore".

```ts
interface UseEditReturnOptions<S> {
  /** Apsolutna ruta na koju EditPage treba da vrati korisnika. */
  path: string;
  /** Generator UI snapshota — pozvan u trenutku stash-a. */
  buildSnapshot?: () => S;
  /** Selector funkcija za scrollY iz snapshota; default: snapshot.scrollY. */
  getScrollY?: (snapshot: S | null) => number | null | undefined;
}

interface UseEditReturnApi<S> {
  /** Snapshot pročitan jednom na mount (consumed iz sessionStorage). */
  initialSnapshot: S | null;
  /** Pozovi prije navigacije na /edit; stashuje path + snapshot. */
  stash: () => void;
}

export function useEditReturn<S = unknown>(opts: UseEditReturnOptions<S>): UseEditReturnApi<S>;
```

Interno:
- `useMemo(() => consumeEditReturnState<S>(), [])` — lazy jednokratan read.
- `useScrollRestore(getScrollY(initialSnapshot))` — automatski restore scroll-a.
- `stash` callback koji poziva `setEditReturn({ path })` + (ako postoji `buildSnapshot`) `stashEditReturnState(buildSnapshot())`.

### 3) (opciono, čisti EditPage) `src/hooks/useEditReturnTarget.ts`

Mini hook koji enkapsulira `returnPathRef` + `navigateBack` iz `EditPage`. Nema scroll logike — samo čita `consumeEditReturn` jednom i izlaže `navigateBack()`.

```ts
export function useEditReturnTarget(): { navigateBack: () => void };
```

## Refaktor pozivnih mjesta

### A) `src/views/SubjectCardsView.tsx`
- Ukloniti lokalni `useMemo` za `initialSnapshot` i lokalni `useEffect` za scroll restore (linije 66 + 77–105).
- Zamijeniti sa:
  ```ts
  const { initialSnapshot, stash } = useEditReturn<EditReturnSnapshot>({
    path: `/subject/${categoryId}/cards`,
    buildSnapshot: () => ({ tab, manageMode, searchQuery, sourceFilter, scrollY: window.scrollY }),
  });
  ```
- `handleEdit` postaje:
  ```ts
  const handleEdit = (card: Card) => {
    stash();
    setEditingCard(card);
    navigate("/edit");
  };
  ```
- Ostalo nepromijenjeno (`initialSnapshot?.tab` itd. nastavlja da radi isto).

### B) `src/views/LearnPage.tsx`
- `handleEdit` koristi `useEditReturn({ path: "/learn" })` (bez `buildSnapshot`):
  ```ts
  const { stash } = useEditReturn({ path: "/learn" });
  const handleEdit = useCallback((card: Card) => {
    stash();
    setEditingCard(card);
    setView("edit");
  }, [stash, setEditingCard, setView]);
  ```

### C) `src/components/MainLayout.tsx` (GlobalSearchWrapper)
- `path` mora biti dinamički (trenutna lokacija u trenutku klika), pa ovdje koristimo:
  ```ts
  const { stash } = useEditReturn({
    path: window.location.pathname + window.location.search,
  });
  ```
  Pošto se path računa na mount, moramo dozvoliti da se proslijedi i kao **funkcija**: proširiti `UseEditReturnOptions.path` na `string | (() => string)` i u `stash` ga lijeno razriješiti. To pokriva slučajeve gdje korisnik može migrirati prije nego klikne.

### D) `src/views/EditPage.tsx`
- Zamijeniti lokalni `returnPathRef` + `useEffect` + `navigateBack` sa:
  ```ts
  const { navigateBack } = useEditReturnTarget();
  ```

## Zadržano ponašanje (regression-safe)

- `sessionStorage` ključevi i format ostaju netaknuti (`sr-edit-return-context`, `sr-edit-return-context:state`). Ovo je čisto refaktor — nema breaking promjene za bookmarkove ili poluotvorene sesije.
- Restore-scroll RAF loop ima identične brojeve (8 attempts ≈ 130ms @ 60fps).
- `consumeEditReturn` / `consumeEditReturnState` se i dalje pozivaju **tačno jednom po mount-u** (lazy `useMemo` + `useEffect` sa praznim deps).
- `EditReturnSnapshot` interface ostaje u `SubjectCardsView` (specifičan za tu stranicu) — hook je generičan preko `<S>` parametra.

## Šta se NE radi u ovom prolazu

- Ne pomjeramo druge `scrollIntoView` pozive (`useSpeedReaderEngine`, `SourceContent`, `GlobalSearch`, `useSourceReaderActions`) — oni rade na specifičnim DOM elementima i imaju različitu semantiku (unutar containera, sa `behavior: "smooth"`); nisu duplikati ovog obrasca.
- Ne mijenjamo `edit-return.ts` API.

## Rezultat

- 25+ linija scroll/restore boilerplate-a u `SubjectCardsView` postaje 1 hook poziv.
- 3 različita `setEditReturn` poziva sa raznim varijantama path-a postaju jednoobrazni.
- `EditPage` se rješava `useRef` + `useEffect` repa.
- Budući viewovi (npr. ZettelkastenView) mogu dobiti scroll restore u jednoj liniji.
