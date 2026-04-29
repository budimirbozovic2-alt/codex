## Problem

Kada korisnik završi (sačuva ili otkaže) editovanje kartice pokrenut iz **SubjectCardsView**, vraća se na pogrešno mjesto — gubi tab (`manage` vs `read`), sub-mode (`edit` vs `structure`), pretragu, source filter i scroll poziciju. Razlog: `EditPage.navigateBack` razumije samo prefix `category:` i `View` enum, ali `SubjectCardsView` šalje `subject-cards:UUID` koji prolazi kroz `setView(... as View)` — nepoznat string → fallback rendering.

Dodatno: čak i da rute rade, sav lokalni state (`tab`, `manageMode`, `searchQuery`, `sourceFilter`, scroll Y) izgubi se jer se komponenta odmontira pri navigaciji na `/edit`.

## Rješenje

Uvodim **`returnContext`** sessionStorage zapis koji nosi i rutu i mini-snapshot UI stanja, plus restore-on-mount u `SubjectCardsView`.

### 1. Definicija `returnContext`

`src/lib/edit-return.ts` (novi fajl):

```ts
const KEY = "sr-edit-return-context";

export interface EditReturnContext {
  /** Absolute path to navigate back to (preferred over View enum). */
  path: string;
  /** Optional UI snapshot to restore — opaque to EditPage. */
  state?: Record<string, unknown>;
  /** Timestamp for staleness guard. */
  ts: number;
}

export function setEditReturn(ctx: Omit<EditReturnContext, "ts">): void {
  sessionStorage.setItem(KEY, JSON.stringify({ ...ctx, ts: Date.now() }));
}

export function consumeEditReturn(): EditReturnContext | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as EditReturnContext;
    // 30 min staleness guard
    if (Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

/**
 * Peek without consuming — used by destination view to read snapshot
 * after navigation completes. Cleared by a separate consume call.
 */
export function peekEditReturnState<T = Record<string, unknown>>(): T | null {
  // Snapshot is stashed in a sibling key so it survives consumeEditReturn().
  const raw = sessionStorage.getItem(KEY + ":state");
  if (!raw) return null;
  sessionStorage.removeItem(KEY + ":state");
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function stashEditReturnState(state: Record<string, unknown>): void {
  sessionStorage.setItem(KEY + ":state", JSON.stringify(state));
}
```

Razdvajanje na dva ključa: `EditPage` konzumira return path odmah pri navigaciji (cleanup), a destination view čita snapshot poseban (`peekEditReturnState`) tek kad se montira.

### 2. `SubjectCardsView` — postaviti i konzumirati state

`handleEdit`:

```ts
const handleEdit = (card: Card) => {
  setEditReturn({ path: `/subject/${categoryId}/cards` });
  stashEditReturnState({
    tab, manageMode, searchQuery, sourceFilter,
    scrollY: window.scrollY,
  });
  setEditingCard(card);
  navigate("/edit");
};
```

Restore on mount (jednom, ako postoji snapshot):

```ts
useEffect(() => {
  const snap = peekEditReturnState<{
    tab?: "manage" | "read";
    manageMode?: "edit" | "structure";
    searchQuery?: string;
    sourceFilter?: string;
    scrollY?: number;
  }>();
  if (!snap) return;
  if (snap.tab) setTab(snap.tab);
  if (snap.manageMode) setManageMode(snap.manageMode);
  if (typeof snap.searchQuery === "string") setSearchQuery(snap.searchQuery);
  if (typeof snap.sourceFilter === "string") setSourceFilter(snap.sourceFilter);
  if (typeof snap.scrollY === "number") {
    // Defer to next frame so the list has had a chance to layout.
    requestAnimationFrame(() => window.scrollTo({ top: snap.scrollY!, behavior: "auto" }));
  }
}, []);
```

### 3. `EditPage` — koristiti novi return context

Zamijeniti staru `previousViewRef` logiku:

```ts
const previousPathRef = useRef<string | null>(null);

useEffect(() => {
  const ctx = consumeEditReturn();
  if (ctx?.path) previousPathRef.current = ctx.path;
}, []);

const navigateBack = useCallback(() => {
  const path = previousPathRef.current;
  if (path) {
    navigate(path);
    return;
  }
  setView("dashboard"); // safe fallback
}, [navigate, setView]);
```

### 4. Backwards compatibility za ostale ulaze

`LearnPage` i bilo koji preostali caller koji koriste `sr-edit-return-view` — ažuriraju se da pozivaju `setEditReturn({ path: "/learn" })` umjesto starog ključa. Stari ključ `sr-edit-return-view` se uklanja iz koda (single grep cleanup).

`MainLayout` GlobalSearchWrapper već ne postavlja return — globalni search namjerno vraća na dashboard; ostavljam.

## Test scenariji

| # | Korak | Očekivano |
|---|---|---|
| 1 | Iz SubjectCardsView → tab `read` → klik edit kartice → save | Vraća na `/subject/X/cards`, tab `read` aktivan |
| 2 | Tab `manage`, sub-mode `structure`, klik edit → cancel | Vraća na `manage`+`structure`, ne na default `manage`+`edit` |
| 3 | Search query "ugovor", scroll na pola liste, klik edit → save | Lista vraćena sa istim query-jem i scroll Y |
| 4 | Iz LearnPage edit → save | Vraća na `/learn` |
| 5 | Stale snapshot (>30 min) | Fallback na rutu bez restore-a state-a |
| 6 | Direct navigacija na `/edit` bez return-context-a | Fallback na dashboard (postojeće ponašanje) |

## Izmjene fajlova

- **NOVO** `src/lib/edit-return.ts` — helpers za return path + state snapshot.
- `src/views/EditPage.tsx` — `consumeEditReturn`, navigacija po `path`.
- `src/views/SubjectCardsView.tsx` — `setEditReturn` + `stashEditReturnState` u `handleEdit`, restore effect on mount.
- `src/views/LearnPage.tsx` — migracija sa starog ključa na novi helper.

## Što ostaje van skopa

- Restore scroll-a unutar virtualizovane liste (CardList) — koristimo window scroll; ako je lista interna scroll-area, fallback je vrh. Ako se kasnije pokaže potrebno, dodaje se `cardId` u snapshot i scroll-into-view u CardList-u.
- Restore expand/collapse stanja kartica unutar liste — trenutno nije zahtijevano.
- GlobalSearch i ostali ad-hoc ulazi u edit — namjerno ostaju na dashboard fallback-u.
