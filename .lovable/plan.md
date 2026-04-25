## Plan: "Matrični Filter" modal + strogi Active Recall

Akcija "Učenje uz aktivno prisjećanje" na `SubjectDashboard` više ne navigira direktno na `/learn`. Otvara modal sa 4 filtera, a "Započni" prosljeđuje preselektovane vrijednosti u `LearnPage` koji odmah pokreće sesiju u **strogom AR režimu** (bez preview čitanja).

### 1. Novi modal — `src/components/learn/MatrixFilterDialog.tsx` (NEW, ~140 linija)

Shadcn `Dialog` sa stanjem koje drži 4 izbora (lokalno u modalu):

| Polje | Opcije | Default |
|------|--------|---------|
| **Oblast** | "Sve" / `<lista subcategorija predmeta>` | Sve |
| **Tip** | Sve / Esejska / Blic | Sve |
| **Frekvencija** | Sve / Često / Rijetko / Nikad | Sve |
| **Sortiranje** | Hronološki / Po težini (`weakest`) | Hronološki |

Header pokazuje broj kartica koje pogađa trenutni filter (live brojanje preko proslijeđene `cards` liste). Footer: "Otkaži" + "Započni" (disabled ako je 0 kartica).

Props:
```ts
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categoryId: string;
  categoryName: string;
  cards: Card[];                // sve kartice predmeta
  subcategories: { id: string; name: string }[];
  onStart: (filters: MatrixFilters) => void;
}

export interface MatrixFilters {
  subcategoryId: string | null;
  type: "all" | "essay" | "flash";
  frequencyTag: "all" | "često" | "rijetko" | "nikad";
  sortMode: "order" | "weakest";
}
```

### 2. Wire-up na `SubjectDashboard.tsx`

- Akcija "Učenje uz aktivno prisjećanje" više nije `<Link>`, postaje `<button onClick={() => setMatrixOpen(true)}>`.
- Dodati `useState` za `matrixOpen` i renderovati `<MatrixFilterDialog .../>`.
- `onStart(filters)` → `navigate(/learn?cat=<id>&mode=strict-recall&sub=...&type=...&freq=...&sort=...)` koristeći `useNavigate` (`react-router-dom`).
- "Konsolidacija znanja" ostaje nepromijenjena.

### 3. `LearnPage.tsx` — čitanje query parametara

Dodati parsiranje URL parametara prije render-a:
```ts
const params = new URLSearchParams(location.search);
const presetMode = params.get("mode");           // "strict-recall"
const presetCat  = params.get("cat");
const presetSub  = params.get("sub");
const presetType = params.get("type") as "all"|"essay"|"flash"|null;
const presetFreq = params.get("freq");
const presetSort = params.get("sort");
```
Proslijediti kao `initialFilters` u `LearnSession`.

### 4. `LearnSession.tsx` — auto-start strogi recall

Dodati opcioni prop `initialFilters?: { mode: "strict-recall"; categoryId; subcategoryId; type; frequencyTag; sortMode }`.

Ako je prisutan:
- Postaviti `selectedCategory/Subcategory`, `filterType`, `sortMode` iz prop-a.
- Postaviti `learnMode = "active-recall"` + novi flag `strictRecall = true`.
- Preskočiti `setupStep` ekrane → `setStarted(true)` u `useEffect` na mount.
- Dodati novi filter u `sortedCards` memo: ako `frequencyTag !== "all"`, filtrirati `cards.filter(c => c.frequencyTag === frequencyTag)`.

Pošto trenutni `sortedCards` ne podržava `frequencyTag` filter, dodaje se samo jedna linija (~3 LOC) i novi state `frequencyFilter`.

### 5. `StudyModeRecall.tsx` — strogi tok bez preview-a

Trenutno modal ima dvije faze: `"preview"` (prikaži sve module → "Pročitano") i `"drill"` (modul po modul: Otkrij → Ocijeni 1-4).

Promjene kad je `strictRecall === true` (novi prop):
- **Preskoči `preview` fazu** — `useEffect` postavlja `arPhase = "drill"` na mount i poziva `onMarkRead(card.id)` automatski.
- Drill ostaje, ali umjesto `GradeButtons` (1-4 skala) prikazati **samo "Potvrdi" dugme** koje šalje grade `4` (uvijek napredak na sljedeći modul).
- Reset preview-a se ne dešava ni pri promjeni kartice — `arPhase` je permanentno `"drill"`.

Tok: Pitanje → "Prikaži odgovor" → odgovor + "Potvrdi" → sljedeći modul/kartica.

Bez `strictRecall` → postojeći tok ostaje netaknut (backward-compatible).

### 6. Tehnički detalji

| Fajl | Akcija | Linije |
|------|--------|--------|
| `src/components/learn/MatrixFilterDialog.tsx` | NEW — modal sa 4 selecta + live count | ~140 |
| `src/views/SubjectDashboard.tsx` | Wire AR akcije na modal, navigate sa query params | ~20 |
| `src/views/LearnPage.tsx` | Parsiraj query params, prosljeđuj u LearnSession | ~15 |
| `src/components/LearnSession.tsx` | `initialFilters` prop, frequencyTag filter, auto-start | ~30 |
| `src/components/learn/StudyModeRecall.tsx` | `strictRecall` prop, preskakanje preview-a, "Potvrdi" dugme | ~25 |
| `src/components/learn/types.ts` | `LearnSessionProps.initialFilters?` + `StudyModeRecallProps.strictRecall?` | ~10 |

**6 fajlova, ~240 linija. Postojeći ručni tok kroz `/learn` (mode → filter → start) ostaje netaknut. Strogi recall je novi paralelni put aktiviran samo iz Subject Dashboarda.**
