# Plan: dodatni testovi za `buildCategoryIdRemap` i `applyRemapToParsed`

Cilj: pojačati `src/test/import-transaction-split.test.ts` s edge-case scenarijima koji pokrivaju trickasti casing i miješane legacy/modern referencije kategorija. Bez izmjena produkcijskog koda.

## Što se dodaje

### `buildCategoryIdRemap` — novi testovi

1. **Diakritike + mixed case** — `"Krivično Pravo"` vs `"KRIVIČNO PRAVO"` vs `"krivično pravo"` se mapiraju jer `toLowerCase()` čuva ć/č; potvrđuje da nema NFC/NFD normalizacije (dokumentuje trenutno ponašanje).
2. **Whitespace nije trimovan** — `"Civilno "` (trailing space) NE matchuje `"Civilno"`; explicitna regresija da znamo da remap radi striktno na `toLowerCase()` bez trim-a.
3. **Duplikati imena u `existing`** — kad dva live recorda imaju isto ime, last-write-wins (drugi unos prepisuje prvi u `existingByName`); test fiksira to ponašanje.
4. **Duplikati imena u `parsed`** — dva backup-record-a s istim imenom oba dobijaju isti `live-id` u remapu.
5. **Prazne kolekcije** — `parsed=[]` i/ili `existing=[]` daju prazan remap bez throw-a.
6. **Backup ID već postoji u live-u pod drugim imenom** — npr. `parsed: {id:"X", name:"A"}`, `existing: {id:"X", name:"B"}, {id:"Y", name:"A"}` → remap `X→Y` (name match pobjeđuje ID match).
7. **Mixed katalog** — kombinacija: jedan record matchuje po imenu, drugi je već isti ID, treći nema match — provjerava se samo prvi u remapu.

### `applyRemapToParsed` — novi testovi

1. **Selektivni remap** — samo dio kartica/sources/mindMaps ima `categoryId` u remapu; ostali ostaju netaknuti.
2. **`cardsToRemap` i `cardMap` mogu sadržati istu karticu (referenca)** — remap se ne aplicira dvaput na način koji bi pokvario podatke (idempotentno na istom ID-u).
3. **`mindMaps` bez `categoryId`** — global mind-map (`m.categoryId === undefined`) se preskače bez throw-a.
4. **KB articles koriste `subjectId`, ne `categoryId`** — eksplicitna regresija da remap dira pravo polje.
5. **Lančani remap NE postoji** — `remap: A→B, B→C`, kartica s `categoryId=A` ide u `B` (jedan hop), ne u `C`. Dokumentuje single-pass semantiku.
6. **Veliki `cardMap` (>1000)** — generišemo ~1500 ulaza i potvrđujemo da svi budu remapirani; pokriva `yieldUI` granu (j % 1000).
7. **Mixed legacy/modern parsed** — `parsed.categories` u modern obliku, ali satellite tablice referenciraju mix starih ID-eva: oni koji su u remapu se prepisuju, ostali ostaju (preduslov za kasniji `pruneOrphans`).

## Tehnički detalji

- Fajl: `src/test/import-transaction-split.test.ts` (jedan dodatak, postojeći testovi netaknuti).
- Koristi se postojeća `makeCard` / `makeCat` / `emptyParsed` infrastruktura — bez novih helpera osim malog `makeManyCards(n)` za scale test.
- Bez novih dependency-ja. Bez izmjena `import-remap.ts`.
- Verifikacija: `bunx vitest run src/test/import-transaction-split.test.ts` mora proći 100%; postojećih 14 testova ostaje zeleno, dodaje se ~14 novih.

## Što plan NE radi

- Ne mijenja produkcijsku semantiku (npr. trim, NFC normalizaciju, chained remap). Testovi 2 i 5 u `applyRemapToParsed` dokumentuju trenutno ponašanje — ako želiš da te grane budu drugačije, to je zaseban feature task.
