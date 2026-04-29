## Cilj
Spojiti "Uređivanje" i "Strukturu i raspored kartica" u jedan hijerarhijski tab pod nazivom **"Uređivanje i raspored kartica"** sa internim segmentiranim prebacivanjem **View ↔ Org**.

## Trenutno stanje
`SubjectCardsView.tsx` već ima jedan top-level tab `"manage"` sa internim segmentiranim switchom (`manageMode: "edit" | "structure"`). Korisnik traži samo terminološko poravnanje: tab labela i imena dva pod-mode-a treba da odražavaju zahtjev.

## Izmjene (sve u `src/views/SubjectCardsView.tsx`)

### 1. Naziv top-level taba (linija 192)
```diff
- <span>Upravljanje karticama</span>
+ <span>Uređivanje i raspored kartica</span>
```

### 2. Sekcijski naslov iznad TabsList (linija 187)
```diff
- Upravljanje
+ Kartice
```
(neutralniji nadgrupni naziv jer se "Upravljanje" ponavljalo u kontekstu jedne stavke)

### 3. Interna segmentirana dugmad (linije 226 i 239)
```diff
- <LayoutList /> Uređivanje i dodavanje
+ <LayoutList /> View — pregled i uređivanje

- <Network /> Struktura i raspored
+ <Network /> Org — struktura i raspored
```
(dvojezično/koncizno: kratak ID "View"/"Org" + opisni tail za jasnoću)

### 4. Header podnaslov kategorije (linija 177, ako pominje stari naziv)
Provjeriti i uskladiti `"Kartice — uređivanje, struktura i pasivno čitanje"` — ostaje, već pokriva.

## Bez promjene
- `manageMode` state ključevi (`"edit" | "structure"`) — ostaju jer ih `EditReturnSnapshot` već persistira.
- `localStorage` ključevi i ponašanje stash/restore — bez izmjena.
- `CardViewMode`, `CardOrgMode`, `StructureManagerDialog` — ne diraju se.
- Pasivno čitanje tab — ostaje zaseban kao i sada.

## Fajl
- **Izmijenjeno:** `src/views/SubjectCardsView.tsx` (4 male tekstualne izmjene labela)