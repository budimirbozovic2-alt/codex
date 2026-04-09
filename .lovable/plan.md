

# Popravka UUID → Naziv prikaza u cijelom sistemu

## Pronađeni problemi

Pregledano je 15+ fajlova. Pronađena su **3 mjesta** gdje se UUID prikazuje umjesto naziva:

### 1. `SessionFilters.tsx` — Glave prikazuju UUID (L205)
- `subNameMap` sadrži samo potkategorije, ali se koristi i za glave: `{subNameMap[ch] || ch}` — pošto glave nisu u mapi, prikazuje se UUID
- **Fix**: Proširiti `subNameMap` da uključi i glave (dodati chapter lookup iz `categoryRecords`)

### 2. `MnemonicWorkshop.tsx` — Potkategorije prikazuju UUID (L289)
- `idToName` sadrži samo kategorije (`categoryRecords.map(r => [r.id, r.name])`), ali potkategorije se prikazuju kao `{sub}` — sirovi UUID
- **Fix**: Proširiti `idToName` da uključi potkategorije, i koristiti `idToName[sub] ?? sub` na L289

### 3. `MnemonicWorkshop.tsx` — Sort po kategoriji koristi UUID za potkategoriju (L109)
- `(a.subcategoryId || "").localeCompare(b.subcategoryId || "")` — sortira po UUID-u umjesto po imenu
- **Fix**: Koristiti `idToName[a.subcategoryId] ?? ""` za sort

## Fajlovi koji su OK (potvrđeno)
- `GlobalSearch.tsx` — uključuje subcategories u mapu ✓
- `SpeedReader`/`SpeedReaderSelector` — uključuje subcategories ✓
- `MnemonicTest.tsx` — uključuje subcategories ✓
- `FrequentErrors.tsx` — uključuje subcategories ✓
- `CardRow.tsx` — koristi `__sub_`/`__ch_` prefikse, pokriva sve ✓
- `CardViewTable.tsx` — inline lookup iz `allCategories` ✓
- `WorkshopCardItem.tsx` — inline lookup ✓

## Promjene

### Fajl 1: `src/components/SessionFilters.tsx`
- Proširiti `subNameMap` (L50-56) da uključi i glave:
  ```
  for (const ch of n.chapters || [])
    if (typeof ch === 'object' && ch.id) m[ch.id] = ch.name;
  ```

### Fajl 2: `src/components/MnemonicWorkshop.tsx`
- Proširiti `idToName` (L73) da uključi potkategorije:
  ```
  const idToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of categoryRecords) {
      m[r.id] = r.name;
      for (const sub of r.subcategories ?? []) m[sub.id] = sub.name;
    }
    return m;
  }, [categoryRecords]);
  ```
- Na L109, sortirati po imenu: `(idToName[a.subcategoryId ?? ""] ?? "").localeCompare(...)`
- Na L289, koristiti `idToName[sub] ?? sub` umjesto `{sub}`

## Scope
- 2 fajla, ~10 linija promijenjeno
- Nema novih zavisnosti

