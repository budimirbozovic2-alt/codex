## Cilj

Ujednačiti kako svi pozivaoci `useEditReturn` definišu **ključne parametre** (return path + identifikatori) i **format snapshot state-a**, tako da hook uvijek vrati konzistentan UI bez "praznih" polja, pogrešnih restore-ova ili izgubljenog scroll-a.

## Šta trenutno nije ujednačeno

Pregled četiri postojeća poziva:

| Pozivalac | Path | Snapshot | Identifikatori | Problem |
|---|---|---|---|---|
| `LearnPage` | `"/learn"` (string) | — (nijedan) | nema | Nema scroll restore, nema editingCardId — povratak iz Edit-a izgubi mjesto |
| `MainLayout` (GlobalSearch) | lazy fn (pathname+search) | — (nijedan) | nema | Vraća se na rutu, ali bez scroll-a / bez podsjećanja koja kartica je editovana |
| `SubjectCardsView` | template literal | `{tab, manageMode, searchQuery, sourceFilter, scrollY}` | bez `categoryId` u snapshot-u | Snapshot se nominalno može iscuriti u **drugu** kategoriju (path se vrati, ali ako je user u međuvremenu otvorio drugu, snapshot se primjenjuje pogrešno) |
| `EditPage` (consumer preko `useEditReturnTarget`) | — | čita samo path | nema validacije | Nema provjere da li snapshot pripada current path-u |

Dodatna inkonzistentnost u tipu state-a:
- Hook radi `(initialSnapshot as { scrollY?: number } | null)?.scrollY` — strukturna pretpostavka koja preživljava samo ako svi snapshot-i imaju `scrollY` na rootu.
- Nema standardnog mjesta za `categoryId` / `cardId` — svaki view to rješava ad-hoc.

## Ciljani standard

Uvesti **`BaseEditReturnSnapshot`** koji svi snapshot-ovi extend-uju, plus **kontrakt-validaciju** pri konzumiranju:

```ts
// src/lib/edit-return.ts
export interface BaseEditReturnSnapshot {
  /** Path snapshot is bound to. Must match consumer's current path. */
  path: string;
  /** Optional vertical scroll to restore. */
  scrollY?: number;
  /** Optional category UUID this snapshot belongs to. */
  categoryId?: string;
  /** Optional card UUID being edited (for cross-validation with editingCard). */
  cardId?: string;
}
```

Hook proširenje (`useEditReturn`):
- `buildSnapshot()` automatski mješa `path`, `scrollY: window.scrollY`, `categoryId`, `cardId` u snapshot pa korisnički view dodaje samo view-specific polja preko `extend?: () => Partial<S>`.
- Pri `consumeEditReturnState`, hook validira `snapshot.path === currentPath` (i `snapshot.categoryId === expectedCategoryId` ako je dat). Ako se ne slaže → vrati `null` i ne pokušava scroll restore.
- `getScrollY` postaje suvišan — uklanja se (uvijek `snapshot.scrollY`).

Identifikatori:
- **`categoryId`** — uvijek dolazi iz `useParams()` ili eksplicitno u `opts.categoryId`.
- **`cardId`** — uvijek `editingCard.id` u trenutku `stash()` (resolved lazy preko callback-a).
- **`path`** — uvijek apsolutan; ako je dat string, koristi se kao-jeste; ako je funkcija, resolve-uje se u `stash()` i u trenutku consume-a se upoređuje sa `window.location.pathname + search`.

## Plan izmjena

### 1. `src/lib/edit-return.ts`
- Dodati `BaseEditReturnSnapshot` interface.
- `consumeEditReturnState` ostaje generička, ali dodaje opcioni `validate?: (s) => boolean` parametar; vraća `null` ako validator padne.

### 2. `src/hooks/useEditReturn.ts`
Novi `UseEditReturnOptions<S>`:
```ts
interface UseEditReturnOptions<S extends BaseEditReturnSnapshot> {
  path: string | (() => string);
  categoryId?: string;       // expected match on consume
  cardId?: () => string | null;  // resolved lazily on stash
  buildExtras?: () => Omit<S, keyof BaseEditReturnSnapshot>;
}
```
Interno:
- `stash()`: resolve path → `setEditReturn({ path })`; gradi snapshot kao `{ path, scrollY: window.scrollY, categoryId, cardId: cardId?.(), ...buildExtras?.() }`; `stashEditReturnState(snapshot)`.
- `initialSnapshot`: `consumeEditReturnState<S>()` + validacija `snapshot.path === currentPath` (i `categoryId` ako je dat). Ako fail → `null`.
- `useScrollRestore(initialSnapshot?.scrollY)` — uvijek na isti način, bez `getScrollY` opcije.

Ukloniti `getScrollY` API (breaking interno, ali svi consumeri se sređuju u istom PR-u).

### 3. `src/views/SubjectCardsView.tsx`
- `EditReturnSnapshot extends BaseEditReturnSnapshot` — uklanja vlastiti `scrollY`.
- Poziv:
  ```ts
  useEditReturn<EditReturnSnapshot>({
    path: `/subject/${categoryId}/cards`,
    categoryId,
    cardId: () => editingCardRef.current?.id ?? null,
    buildExtras: () => ({ tab, manageMode, searchQuery, sourceFilter }),
  });
  ```
- Dodati `editingCardRef` (već imamo `setEditingCard`; držimo ref na karticu prosljeđenu u `handleEdit`).

### 4. `src/views/LearnPage.tsx`
- Dodati minimalni snapshot (čak i bez UI extras — i dalje dobija standardizovan `scrollY`+`cardId` automatski):
  ```ts
  const editingCardRef = useRef<Card | null>(null);
  const { stash } = useEditReturn<BaseEditReturnSnapshot>({
    path: "/learn",
    cardId: () => editingCardRef.current?.id ?? null,
  });
  const handleEdit = (card: Card) => {
    editingCardRef.current = card;
    stash();
    setEditingCard(card);
    setView("edit");
  };
  ```

### 5. `src/components/MainLayout.tsx` (`GlobalSearchWrapper`)
- Isti obrazac: drži ref na trenutno otvaranu karticu, prosljeđuje `cardId` callback. Path ostaje lazy funkcija (rezultat — zavisi od trenutne rute u trenutku klika).

### 6. `src/hooks/useEditReturnTarget.ts`
- Bez izmjena u API-ju, ali interno dodati log-warn ako se `consumeEditReturn` poklopi sa stale path-om (sanity check).

## Šta se postiže

1. **Konzistentan UI nakon povratka iz `/edit`** — svi viewovi automatski dobijaju scroll restore + path-validaciju.
2. **Nema cross-category curenja snapshot-a** — `categoryId` se eksplicitno upoređuje.
3. **Tipovi su uniformni** — svi snapshot-ovi extend-uju jedan base interface; nema više `as { scrollY?: number }` cast-a.
4. **Manje boilerplate-a po view-u** — `scrollY` se više ne piše ručno u `buildSnapshot`.

## Tehnički detalji / rizici

- **Breaking interna izmjena hook-a** (`buildSnapshot` → `buildExtras`, `getScrollY` uklonjen). Sva tri pozivaoca se ažuriraju u istom PR-u, pa van repozitorijuma nema posljedica.
- **Stari ključ u sessionStorage** (`sr-edit-return-context:state`) ostaje isti — ne gubimo postojeće sesije; samo stari snapshot bez `path` polja će pasti validaciju i scroll se neće vratiti taj jedan put.
- **Nije dirano** ponašanje `EditPage`-a — `useEditReturnTarget` i dalje radi isto (samo navigaciju nazad).

## Out of scope

- Ne dirati DnD, FSRS, IndexedDB.
- Ne mijenjati `useEditReturnTarget` javni API.
- Ne uvoditi novi storage key — ostaje `sr-edit-return-context:state`.
