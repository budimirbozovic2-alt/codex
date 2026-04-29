
## Cilj

Ukloniti redundantni "Kartice" red sa dugmetom **"Uređivanje i raspored kartica · {n}"** ispod naslova predmeta i premjestiti broj kartica pored naziva kategorije, ali razdvojeno na **Esej** i **Blic** brojače.

## Trenutno stanje

`src/views/SubjectCardsView.tsx` linije 164–176 sadrže grupu "Kartice" sa jednim `TabsTrigger` koji prikazuje "Uređivanje i raspored kartica" + `cards.length`. Pošto je u ovom prikazu efektivno samo jedan manage tab (drugi je "Pasivno čitanje" featured kartica), ovaj red ne dodaje nikakvu vrijednost — već se vidi koja je sekcija aktivna.

## Šta se mijenja

### `src/views/SubjectCardsView.tsx`

**1. Izračun brojača (poslije `subcategoryNodes` useMemo, oko linije 65)**

```ts
const { essayCount, flashCount } = useMemo(() => {
  let essay = 0, flash = 0;
  for (const c of cards) {
    if (c.type === "essay") essay++;
    else if (c.type === "flash") flash++;
  }
  return { essayCount: essay, flashCount: flash };
}, [cards]);
```

**2. Header (linije 152–161)** — pored `category.name` dodaju se dva `Badge`-a:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <h1 className="text-2xl font-bold text-foreground truncate">{category.name}</h1>
  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1" title="Esejska pitanja">
    <Pencil className="h-3 w-3" /> Esej: {essayCount}
  </Badge>
  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1" title="Blic pitanja">
    <Sparkles className="h-3 w-3" /> Blic: {flashCount}
  </Badge>
</div>
```

**3. Uklanjanje grupe "Kartice" (linije 164–176)** — cijeli `<div className="space-y-1.5">…</div>` blok se briše. `Tabs` ostaje (i dalje upravlja `value=tab`), ostaje samo "Učenje" grupa sa featured "Pasivno čitanje" karticom.

**4. Povratak iz "Pasivno čitanje" u uređivanje** — pošto više nema vidljivog manage triggera, dodaje se mali dugmić u headeru (samo kad je `tab === "read"`) za povratak:

```tsx
{tab === "read" && (
  <Button variant="outline" size="sm" onClick={() => setTab("manage")} className="gap-1.5 h-8 text-xs">
    <Pencil className="h-3.5 w-3.5" /> Nazad na uređivanje
  </Button>
)}
```

Smješta se kao posljednji element u `<div className="flex items-center gap-3">` headeru.

## Šta se NE mijenja

- `Tabs` / `TabsContent` mehanika ostaje (manage je default, read se aktivira klikom na featured karticu).
- "Pasivno čitanje" featured `TabsTrigger` ostaje netaknut.
- Interni Edit↔Struktura segmentirani prekidač unutar manage taba ostaje netaknut (linije 207–245).
- `EditReturnSnapshot` i restore logika ostaju iste.

## Datoteke

- `src/views/SubjectCardsView.tsx` — jedna komponenta, tri male izmjene (izračun, header, uklanjanje grupe).
