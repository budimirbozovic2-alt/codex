## Cilj

Speed Reader prestaje da bude globalna funkcija. Postaje **lokalni mod „Brzo čitanje"** unutar `SubjectCardsView` (Kartice predmeta), kao još jedan tab pored „Pasivno čitanje" — sa identičnim izgledom (preporučena/featured kartica). Radi isključivo nad karticama trenutnog predmeta, izvori i biranje kategorija/podkategorija se uklanjaju.

## Konceptualni model

```text
SubjectCardsView (već postoji)
└── Tabs (vrijednosti: "manage" | "read" | "speed")
    ├── manage  → Uređivanje + Struktura
    ├── read    → Pasivno čitanje (postoji)
    └── speed   → Brzo čitanje (NOVO, lokalno, isti vizualni stil kao "read")
```

`SpeedReader` engine se zadržava (riječi, tajming, TTS, kontrole), ali se **wrap-uje** u novi lokalni komponentni omotač `LocalSpeedReader` koji:
- prima već filtrovanu listu kartica predmeta + `subcategoryNodes` + `categoryId`,
- pokazuje selektor stila „Pasivnog čitanja" (potkat / glava / tip = sve/esej/blic, jedna aktivna kartica),
- za prikaz teksta koristi **isti tekstualni layout kao PassiveReader** (header sa pitanjem + FSRS chip-ovi + sekcije sa naslovima i `prose` HTML), ali sa speed-reader overlay-em za riječ-po-riječ čitanje (highlight aktivne riječi unutar prose teksta).

## Konkretne izmjene

### 1. Novi: `src/components/subject-cards/LocalSpeedReader.tsx`
Lokalna verzija Speed Reader-a. Internally koristi postojeći `useSpeedReaderEngine` ali samo za riječi/tajming/TTS/kontrole — selekcija je lokalna.

Ulazni props (po uzoru na `PassiveReader`):
```ts
interface Props {
  cards: Card[];                // već filtrovano na predmet
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  onEditCard?: (card: Card) => void;
  initialCardId?: string | null;
  onInitialConsumed?: () => void;
}
```

Ponašanje:
- **Filteri (preuzeti iz PassiveReader):** Potkategorija → Glava → Tip (sve/esej/blic). Persist u `localStorage` ključ `speed-reader-filters:{categoryId}` (isti pattern kao `PassiveReader`-ov `passive-reader-filters:`).
- **Card-by-card navigacija:** ChevronLeft/Right + brojač `n / total` (kao PassiveReader). Nema `subcategory-merge` (sve kartice u jedan tok) — Brzo čitanje radi nad **jednom karticom u datom trenutku**, isto kao Pasivno.
- **Prikaz teksta:** kopiramo strukturu `PassiveReader` workspace-a:
  - header `<h2>` sa `current.question` + FSRS chip-ovi (reads, lapses, stability, retention),
  - liste sekcija sa `<h3>` naslovom i sadržajem; **ali** sadržaj se renderuje preko `SpeedReaderDisplay`-a (riječ-po-riječ highlight) umjesto kroz `dangerouslySetInnerHTML`. Ako je previše invazivno, sekcije ostaju u `prose` formatu i ispod njih sjedi `SpeedReaderDisplay` — biramo prvu varijantu (display zamjenjuje sekcije, header sa pitanjem ostaje).
- **Speed kontrole:** koristimo postojeći `<SpeedReaderControls/>` (WPM, font, play/pause, prev/next, TTS).
- **Bez** prikaza izvora, bez panela za izbor kategorije/podkategorije globalno, bez „Čitaj sve kartice predmeta odjednom" — fokus je jedna kartica.

### 2. Refaktor `useSpeedReaderEngine` u dvije varijante (najmanje invazivno)
Engine trenutno čita `cards` iz `AppContext` i dopušta filtriranje po `selCat/selSub` + učitava sve `sources`. Da ne bismo razbijali postojeću logiku, dodajemo **opcioni mod „local"**:

- Nova potpis-varijanta: `useSpeedReaderEngine({ mode: "local", cards: Card[], categoryId: string })` koja:
  - preskače učitavanje `sources` i potpuno isključuje `contentSource === "sources"`,
  - ne nudi `selCat` (zaključan na `categoryId`),
  - prima vec-filtriranu listu (`filteredCards`) spolja preko prop-a, a interni `selSub` se ignoriše ili koristi kao thin pass-through,
  - `startSubcategoryRead` postaje `startCardRead(card)` jer radimo card-by-card.

Implementaciono najsigurnije: **ne diramo** postojeći engine; umjesto toga `LocalSpeedReader` koristi:
- `buildSegments([currentCard])` direktno iz `speed-reader-constants` za aktivnu karticu,
- mali lokalni hook `useLocalSpeedReaderEngine` koji enkapsulira tajming/TTS/kontrole iz postojećeg engine-a (kopiramo samo timer + TTS dio, ~150 LOC, bez selektora i bez `loadSources`).

Ovo izbjegava regressije na globalnoj `/speed-reader` ruti dok je još živa, i ostavlja nam slobodu da je čisto obrišemo u koraku 4.

### 3. `src/views/SubjectCardsView.tsx`
- Tab union postaje `"manage" | "read" | "speed"`.
- `EditReturnSnapshot.tab` proširujemo: `tab?: "manage" | "read" | "speed"`.
- U sekciji „Učenje" (featured) dodajemo **drugi `TabsTrigger`** za „Brzo čitanje", istog vizualnog jezika kao „Pasivno čitanje" (border-2 primary/50, gradient bg, ikona `Zap` u primary blok), poredan **desno od** Pasivno čitanje.
- Layout: `TabsList` postaje `grid grid-cols-1 md:grid-cols-2 gap-3` da dvije featured kartice stoje rame uz rame.
- Novi `<TabsContent value="speed">` renderuje `<LocalSpeedReader …/>` sa istim `cards` i `subcategoryNodes`.
- Dugme „Nazad na uređivanje" (već postoji za `tab === "read"`) proširujemo da se prikazuje i za `tab === "speed"`.
- Subtitle ispod naziva predmeta: „Kartice — uređivanje, struktura, pasivno i brzo čitanje".

### 4. Uklanjanje globalnog Speed Readera
Kada lokalni radi, brišemo:
- **Routes** u `src/App.tsx`: linije za `/speed-reader` i `/subject/:categoryId/speed-reader`, kao i lazy importe `SpeedReaderPage` i `SubjectSpeedReaderPage`.
- **Files:** `src/views/SpeedReaderPage.tsx`, `src/views/SubjectSpeedReaderPage.tsx`, `src/components/SpeedReader.tsx`, `src/components/speed-reader/SpeedReaderSelector.tsx` (zastarjelo — selekcija je sad lokalna).
- **Navigacija:** ukloniti unose iz `src/components/AppSidebar.tsx` (`{ path: "/speed-reader", … }`) i `src/components/TopNav.tsx`.
- **Breadcrumbs:** ukloniti `"/speed-reader"` mapu i ukloniti iz `LAB_ROUTES`.
- **AppContext:** iz `View` union-a izbrisati `"speed-reader"` i odgovarajući redak iz `viewToPath` mape.

Zadržavamo:
- `src/hooks/useSpeedReaderEngine.ts` (ili njegovo srce) — koristi se interno od `LocalSpeedReader`-a.
- `src/components/speed-reader/SpeedReaderControls.tsx`, `SpeedReaderDisplay.tsx`, `speed-reader-constants.ts` — i dalje korisni building blokovi.
- `src/components/SpeedReaderOnboarding.tsx` — okida se iz lokalnog tab-a (mali „Vodič" link u headeru taba „Brzo čitanje").

## UI specifikacija (featured tab par)

```text
┌──────────────────────────────────────────┬──────────────────────────────────────────┐
│  📖  Pasivno čitanje    [Preporučeno]    │  ⚡  Brzo čitanje        [Preporučeno]    │
│  Slušanje i čitanje sadržaja kartica     │  RSVP brzo čitanje kartica predmeta —    │
│  bez ocjenjivanja                        │  treniraj brzinu i fokus                  │
└──────────────────────────────────────────┴──────────────────────────────────────────┘
```

- Ikona za Brzo: `Zap` (lucide), iste boje i raspored kao kod Pasivno (primary blok pozadine, primary-foreground ikona).
- Bez `[Sparkles]` chip-a u desnom kutu na Brzom — samo Pasivno ostaje označeno kao primarno preporučeno; Brzo nosi label „Brzo" mali badge umjesto „Preporučeno", da hijerarhija ostane jasna. (Otvoren detalj — ako želiš oba kao „Preporučeno", lako je promijeniti.)

## Edge cases

- **Prazan predmet:** „Nema esejskih ni blic kartica za brzo čitanje." (PassiveReader-style empty state).
- **Filteri sakrivaju aktivnu karticu:** isti pattern kao u `PassiveReader` (`initialCardId` two-phase reset filtera).
- **TTS:** ostaje globalno iz `loadTTSSettings/saveTTSSettings`.
- **Persistirani snapshot tab-a:** ako legacy snapshot ima `"read"` ostaje validan; za `"speed"` postoji guard (`tab === "speed" ? "speed" : initialSnapshot?.tab ?? "manage"`).

## Šta se NE mijenja

- FSRS, review log, stats, planner, dashboard predmeta (osim eventualnog dugmeta — vidi pitanje ispod, ali default je da Brzo čitanje ostane samo unutar „Kartice" view-a, pošto je tu i Pasivno čitanje).
- `SpeedReaderControls`, `SpeedReaderDisplay`, `speed-reader-constants` (samo se reuse-uju).
- Onboarding sadržaj.

## Otvoreno pitanje (ako želiš drugačije)

Iz teksta („dugme treba da stoji pored dugmeta Pasivno čitanje") razumijem da govorimo o **tabu** unutar `SubjectCardsView` (jer je tamo Pasivno čitanje). Ako si mislio na **dugme na SubjectDashboard-u**, javi pa ću dodati i duplikat shortcut tile (tile pored „Kartice" / kao novi „Brzo čitanje" tile koji vodi na `/subject/:categoryId/cards?tab=speed`).

## Lista fajlova

**Novi**
- `src/components/subject-cards/LocalSpeedReader.tsx`

**Izmijenjeni**
- `src/views/SubjectCardsView.tsx` (novi tab + featured tile)
- `src/App.tsx` (uklanjanje globalnih ruta)
- `src/components/AppSidebar.tsx` (uklanjanje stavke)
- `src/components/TopNav.tsx` (uklanjanje stavke)
- `src/components/Breadcrumbs.tsx` (uklanjanje mape i LAB_ROUTES)
- `src/contexts/AppContext.tsx` (uklanjanje `"speed-reader"` iz `View` i `viewToPath`)

**Obrisani**
- `src/views/SpeedReaderPage.tsx`
- `src/views/SubjectSpeedReaderPage.tsx`
- `src/components/SpeedReader.tsx`
- `src/components/speed-reader/SpeedReaderSelector.tsx`
- `src/hooks/useSpeedReaderEngine.ts` (ako uspijem cijeli zamijeniti lokalnim hook-om; u suprotnom ostaje, samo se prestaje koristiti globalno)
