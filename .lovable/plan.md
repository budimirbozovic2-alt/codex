## Cilj

Kada korisnik klikne "Konsolidacija znanja" sa **lokalnog (Subject) Dashboarda**, cijela sesija mora biti **strogo zaključana na trenutni predmet (`categoryId`)** — bez mogućnosti da se kroz UI proširi na druge kategorije. Kada se otvori sa globalnog dashboarda, ponašanje ostaje slobodno (sve kategorije).

## Trenutno ponašanje

`SubjectDashboard.tsx:118` već šalje `to: /review?category=${categoryId}` → `ReviewPage` čita `searchParams.get("category")` → prosljeđuje kao `preSelectedCategory` u `ReviewSession` → `ReviewSetup`.

Ali postoje **tri rupe** koje dozvoljavaju ispadanje iz scope-a:

1. **Reset gumba** u Setup-u (`ReviewSetup.tsx:276`) "Nazad na režime" briše `selectedCategory` → korisnik završi u globalnom režimu kada se vrati na izbor mode-a.
2. **`SessionFilters` predmet-piluli** (`SessionFilters.tsx:170-197`) prikazuju **sve** dostupne kategorije + "Sve" pilulu → korisnik može jednim klikom proširiti scope.
3. **Mode-screen brojači** rade nad `filteredDueCards`/`filteredAllCards` (koji koriste `selectedCategory`), tako da inicijalno **jesu** lokalni — ALI ako korisnik resetuje (rupa #1), brojači postanu globalni.

Dodatno: **`ReviewPage` ne filtrira `dueCards.length === 0`** prije EmptyState-a — koristi globalni broj. Posljedica: ako globalno ima dospjelih kartica, ali ne u našoj kategoriji, korisnik vidi setup ekran sa "0 sekcija" umjesto smislenog EmptyState-a.

## Rješenje

Uvodim **`lockedCategory`** koncept — kada je prisutan, UI tretira tu kategoriju kao nepromjenjivu granicu domena.

### 1. `ReviewPage.tsx` — proslijediti lock + filtrirati EmptyState

```ts
const lockedCategory = preSelectedCategory; // alias za jasnoću semantike

const scopedDueCards = useMemo(
  () => lockedCategory ? dueCards.filter(c => c.categoryId === lockedCategory) : dueCards,
  [dueCards, lockedCategory],
);
const scopedAllCards = useMemo(
  () => lockedCategory ? cards.filter(c => c.categoryId === lockedCategory) : cards,
  [cards, lockedCategory],
);

// Diagnostics računati nad scopedAllCards
// EmptyState provjera nad scopedDueCards.length
```

Proslijediti `scopedDueCards`, `scopedAllCards`, `lockedCategory` u `ReviewSession`.

### 2. `ReviewSession.tsx` — proslijediti `lockedCategory` dalje

Dodaj `lockedCategory?: string | null` prop, dalje u `ReviewSetup`. Bez druge logičke izmjene (jer su `dueCards`/`allCards` već scope-ovani od strane `ReviewPage`).

### 3. `ReviewSetup.tsx` — zaključati izbor

```ts
// Inicijalni state ostaje, ali ako je lockedCategory prisutan, nikad ga ne resetujemo:
const [selectedCategory, setSelectedCategory] = useState<string | null>(
  lockedCategory ?? preSelectedCategory ?? null,
);

// "Nazad na režime" gumb — ne resetuj selectedCategory ako je locked:
onClick={() => {
  setSetupStep("mode");
  setMode(null);
  if (!lockedCategory) setSelectedCategory(null);
  setSelectedSubcategory(null);
  setSelectedChapter(null);
  setFilterExamFrequent(false);
}}

// onSelectCategory u SessionFilters — ignoriši ako je locked:
onSelectCategory={(cat) => {
  if (lockedCategory) return; // safety, plus UI hides the buttons
  setSelectedCategory(cat);
  setSelectedSubcategory(null);
  setSelectedChapter(null);
}}
```

Dodaj **vizuelnu indikaciju** zaključanog scope-a iznad mode-grid-a:

```tsx
{lockedCategory && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-xs">
    <Lock className="h-3.5 w-3.5 text-primary" />
    <span className="text-foreground">
      Konsolidacija ograničena na predmet:&nbsp;
      <strong>{categoryRecords.find(r => r.id === lockedCategory)?.name ?? "—"}</strong>
    </span>
  </div>
)}
```

Proslijediti `lockedCategory` u `SessionFilters` kao novi prop `lockedCategory` (vidi #4).

### 4. `SessionFilters.tsx` — sakriti/onemogućiti predmet-pilule kad je lock

```ts
interface Props {
  // ...
  lockedCategory?: string | null;
}

// Predmet sekcija — kada je lock, prikaži samo jednu read-only pilulu sa lock ikonicom:
{lockedCategory ? (
  <div className="flex">
    <span className={`${PILL_BASE} bg-primary/10 text-primary border border-primary/20 cursor-default flex items-center gap-1.5`}>
      <Lock className="h-3 w-3" />
      {catName(lockedCategory)}
    </span>
  </div>
) : (
  <ScrollableRow>...postojeće "Sve" + mapiranje kategorija...</ScrollableRow>
)}
```

Potkategorije i Glave ostaju funkcionalne (one i dalje sužavaju unutar zaključanog predmeta — to je željeno ponašanje).

### 5. Ostali Subject-Dashboard ulazi (provjera)

Provjerim ostale komponente koje rutiraju u `/review` da osiguram konzistentnost:

- `Breadcrumbs.tsx`, `TopNav.tsx`, `AppSidebar.tsx`, `DashboardPage.tsx` — ako ijedan od njih linkuje `/review` **bez** `?category=` iz Subject konteksta, ostavljam takvog kakav jest (taj ulazi su globalni po dizajnu).

## Test scenariji

| Scenarij | Očekivano |
|---|---|
| Klik "Konsolidacija" sa SubjectDashboard predmet A | Setup pokazuje lock-banner sa imenom A; brojači mode-ova prikazuju samo sekcije iz A; predmet-piluli zaključani |
| Klik "Nazad na režime" u zaključanom flow-u | Vraća na mode-grid, lock i dalje aktivan, brojači i dalje za A |
| Pokušaj klika na drugu kategoriju u SessionFilters | Pilule nisu klikabilne (read-only); ako hardcoded poziv prođe — handler odbija |
| Sve kartice iz A urađene | EmptyState (a ne setup sa "0 sekcija") |
| Globalni `/review` bez `?category=` | Ponašanje nepromijenjeno: sve kategorije, "Sve" pilula, slobodan izbor |
| Resume sačuvane sesije pokrenut iz lock-a | Resume radi, lock i dalje važi |

## Izmjene fajlova

- `src/views/ReviewPage.tsx` — scoping `dueCards`/`allCards`/`diagnostics` po `lockedCategory`, prosljeđivanje propova.
- `src/components/ReviewSession.tsx` — propagacija `lockedCategory` props-a.
- `src/components/review/ReviewSetup.tsx` — banner, čuvanje lock-a kroz reset, prosljeđivanje u `SessionFilters`.
- `src/components/SessionFilters.tsx` — read-only pilula za predmet kada je lock, novi `lockedCategory` prop.
- `src/components/review/review-constants.ts` (ili gdje god je `ReviewSessionProps`/`ReviewSetupProps`) — dodati `lockedCategory?: string | null` u interfaceove.

## Što ostaje van skopa

- Promjena URL šeme (`/review?category=X` ostaje; ne uvodimo `/subject/:id/review`).
- Filteri tipa kartice, ispitne frekvencije, potkategorije i glave — nepromijenjeni (oni i dalje sužavaju **unutar** zaključanog predmeta).
- Ostale ulazne tačke u review (TopNav, Sidebar, globalni Dashboard) — namjerno ostaju globalne.
