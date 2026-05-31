# Cilj
Eliminisati preostale `SQLITE_CONSTRAINT_FOREIGNKEY (787)` greške prilikom importa, koje nastaju kada `merged` cards reference `categoryId` koji ne postoji u finalnom skupu kategorija nakon `writeCategoriesTx`.

# Korijenski uzrok
`pruneOrphans()` validira samo `parsed.sources / mindMaps / mnemonics / knowledgeBaseArticles`. Cards se ne pišu iz `parsed.cards` nego iz `merged` (rezultat `mergeCardsByStrategy`), pa ih nijedan postojeći filter ne dotiče. Najčešći trigeri:
- Non-overwrite import sa karticom čiji `categoryId` nije u DB-u i nije remapiran po imenu.
- Legacy backup u kojem se za string[] kategorije generišu novi UUID-jevi, a cards i dalje nose stare.
- Overwrite sa nekompletnim `parsed.categories`.

# Izmjene

## 1. `src/lib/backup/import-transaction.ts`
Nakon `writeCategoriesTx` (već imamo `finalCategories`) i prije `writeSourcesTx`, dodati defensive scrub:

```ts
const validCategoryIds = new Set(finalCategories.map((c) => c.id));

let droppedCards = 0;
const beforeLen = merged.length;
for (let i = merged.length - 1; i >= 0; i--) {
  if (!validCategoryIds.has(merged[i].categoryId)) {
    delete nextMap[merged[i].id];
    merged.splice(i, 1);
    droppedCards += 1;
  }
}
if (droppedCards > 0) {
  backupLog.warn("import", "dropped cards with orphan categoryId", {
    dropped: droppedCards, before: beforeLen, after: merged.length,
  });
}
```

Postojeći `sourceId` scrub ostaje nakon `writeSourcesTx` (pokriva svoj FK).

## 2. `src/lib/backup/import-remap.ts` — sigurnosna mreža
Proširiti `pruneOrphans` da uključi `parsed.cards` (za putanje koje pišu direktno iz parsed-a u budućnosti, i da semantika imena bude tačna):

```ts
parsed.cards = parsed.cards.filter((c) => !c.categoryId || validCategoryIds.has(c.categoryId));
```

To je no-op za trenutni hot path (writeCardsTx koristi merged), ali sprečava regresiju ako se neko pozove direktno.

## 3. Logging
Dodati jednokratni `backupLog.warn("import", "dropped cards with orphan categoryId", { dropped, before, after })` da operativno vidimo koliko se kartica gubi po realnom importu (vezuje se na već postojeću `scrubbed orphan card.sourceId` poruku).

## 4. Testovi
- Proširiti `src/lib/backup/__tests__/import-transaction.*` (ako postoji; ako ne, dodati novi) sa dva slučaja:
  1. **Non-overwrite**: backup sa karticom čiji categoryId ne postoji ni u DB-u ni u `parsed.categories` → kartica se dropuje, `applyImportAtomically` prolazi bez baciti.
  2. **Legacy string[] categories**: backup sa cards koje nose stari UUID, nove kategorije dobiju nove UUID-jeve → bez scrub-a tx pucne na FK; sa scrub-om prolazi i logira `dropped > 0`.

# Tehnički detalji
- Scrub mora biti **u tx**, prije `writeCardsTx`, koristeći `finalCategories` (povratna vrijednost `writeCategoriesTx`).
- `merged.splice` u obrnutom loop-u — bezbjedno za in-place uklanjanje.
- `nextMap[id]` mora biti čišćen u istom prolazu da post-tx pozivaoci (UI cache) ne vide phantom cards.
- pruneOrphans potpis ostaje isti (`(parsed, validCategoryIds)`), samo dodaje jedno polje — bez breaking change-a.

# Non-goals
- Ne diramo signature `writeCardsTx` / `writeSourcesTx`.
- Ne mijenjamo `mergeCardsByStrategy`.
- Ne uvodimo nove tabele ni migracije.

# Validacija
Pokrenuti `bunx vitest run src/lib/backup` i puni suite. Očekujemo zelene testove i log poruku `dropped cards with orphan categoryId` u problematičnim importima.
