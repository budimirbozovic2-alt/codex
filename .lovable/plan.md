

# Popravka layouta stranice predmeta

## Pronađeni problemi

1. **Dupli naslov predmeta** — `CategoryView` prikazuje `h1` sa imenom kategorije (L189), a `SubcategoryList` u tabu "Mapa znanja" ponovo renderuje `Header` komponentu sa istim imenom (L72-76, L136-142). Isti problem u oba code path-a (source hierarchy i fallback).

2. **Beskoristan Back dugme** — `SubcategoryList` renderuje `Header` sa `onBack` koji je u CategoryView postavljen na `() => {}` (L388) — dugme postoji ali ne radi ništa jer smo već unutar taba predmeta.

3. **MentalSkeleton dupli kontekst** — Kad se otvori potkategorija, `MentalSkeleton` prikazuje svoj header sa "Mentalni Kostur" naslovom + `catDisplayName → subDisplayName`, što je redundantno jer je korisnik već u tabu tog predmeta.

4. **Tabs overflow na mobilnom (430px)** — 4 taba sa tekstom + ikonama + badge-ovima prelaze širinu ekrana. `TabsList` nema horizontalni scroll.

## Plan

### Fajl 1: `src/components/knowledge-map/SubcategoryList.tsx`
- Dodati opcionalni prop `embedded?: boolean` (default `false`)
- Kad je `embedded === true`: preskočiti renderovanje `Header` komponente (nema naslova, nema back dugmeta), prikazati samo `SearchBar` i grid kartica
- Oba code path-a (source hierarchy L62-100 i fallback L126-170) dobijaju istu logiku

### Fajl 2: `src/components/MentalSkeleton.tsx`
- Dodati opcionalni prop `embedded?: boolean`
- Kad je `embedded === true`: zamijeniti veliki header sa kompaktnijim — prikazati samo ime potkategorije i back dugme (bez "Mentalni Kostur" naslova i redundantnog `catDisplayName`)

### Fajl 3: `src/views/CategoryView.tsx`
- Proslijediti `embedded={true}` u `SubcategoryList` (L379) i `MentalSkeleton` (L370)
- Ukloniti `onBack={() => {}}` prop iz `SubcategoryList` — zamijeniti sa `onBack` koji se ne koristi kad je embedded
- Na `TabsList`: dodati `overflow-x-auto` i `flex-nowrap` za horizontalni scroll na mobilnom
- Na `TabsTrigger`: sakriti tekst labela na malim ekranima (`hidden sm:inline`), ostaviti samo ikone + badge

### Scope
- 3 fajla, ~30 linija neto promjena
- Backward-compatible — `embedded` je opcionalan, postojeći pozivi bez njega rade isto kao prije

