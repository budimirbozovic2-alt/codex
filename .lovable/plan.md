## Nalaz

Glavni izvor sva tri simptoma je isti: SQLite executor u Lovable/Vite preview-u ne nastaje, jer `@sqlite.org/sqlite-wasm` pokušava učitati `sqlite3.wasm` iz Vite prebundle putanje `node_modules/.vite/deps/sqlite3.wasm`, a server vraća HTML umjesto WASM-a.

Dokaz iz browser konzole:

```text
Incorrect response MIME type. Expected application/wasm
expected magic word 00 61 73 6d, found 3c 21 64 6f
[sqlite] dev-fallback open failed
```

`3c 21 64 6f` je početak `<!do...`, tj. HTML dokument, ne `.wasm` fajl.

## Kako to proizvodi prijavljene simptome

1. **Kategorije se prepisuju / ostaje samo jedna**
   - `categoryRepository.commit` prvo optimistično upiše RAM snapshot, ali zatim unutar mutexa ponovo čita “kanonsko” stanje iz SQLite-a (`src/lib/repositories/categoryRepository.ts:62-74`).
   - Pošto executor ne postoji, `listAllCategories()` vraća `[]` (`src/lib/db/queries/categories.ts:66-71`).
   - Updater se zato re-aplicira na praznu listu, pa druga dodata kategorija postaje jedina kategorija.
   - Dodatni bug: `bulkPutCategories` nema `if (!exec) return/throw` prije `exec.transaction` (`src/lib/db/queries/categories.ts:127-128`), pa boot seed pada sa `Cannot read properties of null (reading 'transaction')`.

2. **Izvori toastuju uspjeh, ali se ne prikazuju**
   - Source read/write ide kroz isti executor (`src/lib/db/queries/sources.ts:19-35`, `src/lib/sources-storage.ts:73-80`).
   - Kada executor padne, izvor nije stvarno upisan u SQLite; read query za listu izvora ostaje prazan.
   - WriteResult refactor je dobar korak, ali ne rješava korijenski problem: bez ispravnog `.wasm` asseta nema baze iz koje se može čitati.

3. **Dodavanje kartica je sporo**
   - `useCardMutations` očekuje da `persistQueue.cleanup()` propagira persist greške (`src/hooks/card/useCardMutations.ts:55-60`).
   - `persistQueue.flush()` trenutno hvata grešku, re-enqueue-uje snapshot i radi retry/backoff bez bacanja greške (`src/lib/persist-queue.ts:131-178`).
   - Kada svaki pokušaj mora ponovo proći kroz neuspjeli sqlite-wasm init, jedna kartica dobija višesekundni latency i može ostati u lažno “uspješnom” stanju.

## Vjerovatne dodatne posljedice istog izvora

Isti executor miss utiče i na:

- default seed predmeta na boot-u (`seedDefaultCategories`),
- settings/planner/log read-path,
- mind maps,
- mnemonics,
- knowledge base / Zettelkasten,
- source editing i lazy editor-v4 migraciju,
- card query invalidacije koje nakon refetcha vide praznu SQLite tabelu.

Dakle, ovo nije niz nezavisnih UI bugova nego sistemski kvar na SQLite runtime assetu + nekoliko mjesta gdje se executor miss tretira kao validno prazno stanje.

## Plan rješenja

### 1. Popraviti učitavanje `sqlite3.wasm` u DEV i Electron buildu

- Uvesti eksplicitan Vite asset URL za WASM:

```ts
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
```

- U `src/lib/persistence/sqlite/client.ts` i `src/lib/persistence/sqlite/dev-fallback.ts` pozivati sqlite initializer sa `locateFile`, tako da `sqlite3.wasm` uvijek ide na Vite-servirani asset URL, a ne na `node_modules/.vite/deps/sqlite3.wasm`.
- Dodati mali shared helper npr. `src/lib/persistence/sqlite/sqlite-init.ts` da ne dupliramo init logiku između desktop klijenta i DEV fallbacka.
- Po potrebi u `vite.config.ts` dodati `optimizeDeps.exclude: ["@sqlite.org/sqlite-wasm"]` ili zadržati explicit `locateFile` kao primarni osigurač. Cilj je da browser konzola više nema `Incorrect response MIME type` / `expected magic word` greške.

### 2. Učiniti category write-path otporan na executor miss

- Popraviti `bulkPutCategories`: ne smije dereferencirati `exec` ako je `null`.
- Za write metode nad kategorijama (`replaceAllCategories`, `bulkPutCategories`, `putCategory`) uvesti jasnu `NO_EXECUTOR` grešku umjesto tihog no-op-a kada se radi o write operaciji.
- U `categoryRepository.commit` ne smije se canonical re-read `[]` tretirati kao validna baza ako write ne može biti izvršen.
  - Ako persist padne sa `NO_EXECUTOR`, vratiti snapshot ili zadržati prethodno validno RAM stanje, ali nikad ne zamijeniti postojeće kategorije rezultatom `updater([])`.
  - Ovo direktno uklanja “drugi predmet briše prvi”.

### 3. Poravnati card persistQueue sa WriteResult semantikom

- `persistQueue.cleanup()` mora moći signalizirati grešku calleru; trenutno komentar u `useCardMutations` kaže da persist greške propagiraju, ali `flush()` ih proguta.
- Dodati strict flush/cleanup režim za interaktivne mutacije:
  - `NO_EXECUTOR` se ne retry-uje,
  - SQL/FK greške se vraćaju mutaciji da TanStack rollback uradi svoje,
  - background retry može ostati samo za situacije gdje je zaista opravdan, ali ne smije proizvoditi lažni uspjeh.
- Time se uklanja višesekundno čekanje i lažni uspjeh pri dodavanju kartice kada baza nije dostupna ili FK ne postoji.

### 4. Provjeriti source/mind-map WriteResult call-siteove

- Potvrditi da svi source UI tokovi prikazuju success toast samo poslije `await mutateAsync(...)` koji je stvarno uspio.
- Isto provjeriti za mind maps jer koriste isti obrazac (`saveMindMap` / `useMindMapMutations`).
- Dodati zaštitu od optimistic cache “duhova”: ako write padne prije nego što je prethodni query postojao, rollback treba očistiti optimistički ubačeni item, ne samo vratiti `prevByCat` kada je definisan.

### 5. Testovi i smoke provjera

Dodati/regresiono pokriti:

- `categoryRepository.commit`: postojeća kategorija + neuspjeli executor ne smije završiti kao `[nova]` ili `[]`.
- `bulkPutCategories`: executor `null` ne smije baciti `Cannot read properties of null`.
- `useSourceMutations`: write failure uklanja optimistic source iz cachea i ne ostavlja lažni prikaz.
- `persistQueue.cleanup`: interaktivni card save dobija grešku kada adapter faila.

Manual smoke u preview-u nakon implementacije:

1. Konzola nema `sqlite3.wasm` MIME/magic-word greške.
2. Boot učita default predmete.
3. Dodati dva nova predmeta: oba ostaju prikazana.
4. Dodati karticu: završava brzo i ostaje poslije refetcha.
5. Importovati/sačuvati izvor: success toast se prikazuje samo ako se izvor vidi u listi.
6. Provjeriti mind maps / Zettelkasten osnovni save jer dijele isti executor sloj.