## Bug: Naslov modula se duplira u tijelu

### Lokacija
`src/components/source-reader/SmartSplitSummaryDialog.tsx`, funkcija `performManualCut` (linije ~209–248).

### Uzrok
Kod reza, blok na indeksu `blockIdx` se koristi kao naslov novog modula, ali se zatim uključuje i u `afterHtml`:

```ts
const afterHtml = joinHtmlBlocks(blocks.slice(blockIdx)); // ← uključuje blok naslova
const newTitle = htmlToPlain(blocks[blockIdx])...;
```

Rezultat: naslov se prikazuje kao naslov modula i kao prvi paragraf u tijelu.

### Popravka
Promijeniti `slice(blockIdx)` u `slice(blockIdx + 1)` tako da se blok naslova izreže iz tijela. `beforeHtml` ostaje nepromijenjen (`slice(0, blockIdx)` već isključuje blok rezanja).

```ts
const beforeHtml = joinHtmlBlocks(blocks.slice(0, blockIdx));
const titleBlock = blocks[blockIdx];
const afterHtml  = joinHtmlBlocks(blocks.slice(blockIdx + 1));
const newTitle = htmlToPlain(titleBlock).replace(/\s+/g, " ").trim().slice(0, 200) || "Novi modul";
```

### Provjera regresije
- `splitSelection` u `selection-split-engine.ts` već ekskluduje liniju "Član X" iz tijela kroz `lineIndex + 1` start — bez duplikata.
- `splitModuleByDelimiter` ne dira naslove blokova — bez uticaja.
- Jedini izvor bug-a je manuelno rezanje u wizardu.

Bez izmjena UI/UX, samo ispravka string/blok aritmetike.