## Phase 3 — GlobalSearchWrapper re-render fix

`GlobalSearchWrapper` u `src/components/MainLayout.tsx` poziva `useCardData()` na svakom MainLayout passu, pa se cijeli wrapper subtree re-renderuje na svaku card mutaciju — čak i kad je modal zatvoren. Subscription premiještamo **unutar** `GlobalSearch`, koji je `lazy()` + montiran samo kad `open === true` (early-return guard `if (!open) return null` u wrapperu). Time se subscription kreira kada se modal otvori i raskida kada se zatvori.

Ostale pretplate u wrapperu (`useUIContext`, `useEditReturn`) ne subscribuju na `cards` i ne diramo ih.

---

### File 1: `src/components/MainLayout.tsx`

**BEFORE** (linije 78–106):
```tsx
/** Isolated wrapper for GlobalSearch */
const GlobalSearchWrapper = memo(function GlobalSearchWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { cards } = useCardData();
  const { setView, setEditingCard } = useUIContext();
  // Path is resolved lazily inside `stash()` so it reflects the route at
  // the moment of the click, not when this wrapper mounted.
  const editingCardIdRef = useRef<string | null>(null);
  const { stash: stashEditReturn } = useEditReturn({
    path: () => window.location.pathname + window.location.search,
    cardId: () => editingCardIdRef.current,
  });
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch
        cards={cards}
        open={open}
        onClose={onClose}
        onNavigateToCard={(card) => {
          editingCardIdRef.current = card.id;
          stashEditReturn();
          setEditingCard(card);
          setView("edit");
        }}
      />
    </Suspense>
```

**AFTER**:
```tsx
/** Isolated wrapper for GlobalSearch.
 *
 * Phase-3 perf fix: this wrapper renders on every MainLayout pass, so it must
 * NOT subscribe to global card data. Previously `useCardData()` was called
 * here, which made every card mutation re-render the wrapper (and its tree)
 * even while the search modal was closed. The `cards` subscription now lives
 * INSIDE `GlobalSearch`, which only mounts when `open === true` (see the
 * early-return guard below + the `lazy()` import). */
const GlobalSearchWrapper = memo(function GlobalSearchWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { setView, setEditingCard } = useUIContext();
  // Path is resolved lazily inside `stash()` so it reflects the route at
  // the moment of the click, not when this wrapper mounted.
  const editingCardIdRef = useRef<string | null>(null);
  const { stash: stashEditReturn } = useEditReturn({
    path: () => window.location.pathname + window.location.search,
    cardId: () => editingCardIdRef.current,
  });
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch
        open={open}
        onClose={onClose}
        onNavigateToCard={(card) => {
          editingCardIdRef.current = card.id;
          stashEditReturn();
          setEditingCard(card);
          setView("edit");
        }}
      />
    </Suspense>
```

Napomena: import `useCardData` u liniji 4 ostaje (koristi ga `MainLayout` na linijama 32–33). Nije potrebno mijenjati import listu.

---

### File 2: `src/components/GlobalSearch.tsx`

**BEFORE** — import (linija 11):
```tsx
import { useCategoryData } from "@/contexts/AppContext";
```

**AFTER**:
```tsx
import { useCardData, useCategoryData } from "@/contexts/AppContext";
```

**BEFORE** — Props (linije 19–24):
```tsx
interface Props {
  cards: Card[];
  open: boolean;
  onClose: () => void;
  onNavigateToCard: (card: Card) => void;
}
```

**AFTER**:
```tsx
interface Props {
  open: boolean;
  onClose: () => void;
  onNavigateToCard: (card: Card) => void;
}
```

**BEFORE** — komponenta (linije 52–55):
```tsx
export default function GlobalSearch({ cards, open, onClose, onNavigateToCard }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { categoryRecords: catRecords } = useCategoryData();
```

**AFTER**:
```tsx
export default function GlobalSearch({ open, onClose, onNavigateToCard }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Phase-3 perf fix: subscribe to global card data ONLY here. This component
  // is lazy-loaded and conditionally mounted by `GlobalSearchWrapper`, so the
  // subscription is created when the modal opens and torn down when it closes.
  const { cards } = useCardData();
  const { categoryRecords: catRecords } = useCategoryData();
```

---

### Out of scope

- Ostatak `GlobalSearch` koji koristi `cards` (memo filter/search logika) ostaje netaknut — varijabla je sada izvedena iz hook-a umjesto props-a, isti tip `Card[]`.
- Bez izmjena u testovima, događajima, ni u IDB sloju.