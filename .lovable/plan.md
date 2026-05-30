## Plan

1. **Razdvojiti dva režima rada**
   - Lovable web preview i običan browser dev shell ne smiju pokušavati otvoriti OPFS SQLite.
   - Electron dev/prod smiju otvoriti SQLite, ali samo ako postoje potrebni OPFS/worker API-ji.

2. **Popraviti desktop guard**
   - `assertDesktop()` trenutno ne radi ništa u DEV-u, zato import u preview-u prođe guard i tek kasnije padne na `Missing required OPFS APIs`.
   - Uvesti import-time guard koji i u DEV-u provjerava `isElectron()` prije `getOpfsSqliteExecutor()` i baca jasnu grešku tipa: “Import je dostupan samo u desktop aplikaciji.”
   - Ne mijenjati globalni `assertDesktop()` za cijelu aplikaciju, da preview i dalje može služiti za UI pregled.

3. **Popraviti SQLite WASM putanju za Electron**
   - Dodati `locateFile`/config pri inicijalizaciji `@sqlite.org/sqlite-wasm` tako da Electron eksplicitno traži:
     - prod: `app://localhost/sqlite/sqlite3.wasm` i prateće runtime fajlove
     - dev Electron: Vite-served asset iz `node_modules` ili kopirani `/sqlite/...` path
   - Provjeriti da `main.cjs` `app://` handler vraća `.wasm` kao `application/wasm`; trenutno MIME mapa nema `.wasm`.

4. **Zadržati postojeću import arhitekturu**
   - Ne praviti novi importer i ne ravnati backup ručno.
   - Ostaviti postojeći atomic SQLite transaction, taxonomy remap, write-cards/write-satellite pipeline.

5. **Dodati ciljane regresione provjere**
   - Test/guard za `applyImportAtomically`: u non-Electron okruženju ne smije importovati `sqlite/client` niti pokušati učitati WASM.
   - Test ili statička provjera da `app://...sqlite3.wasm` dobija `application/wasm` MIME.

## Očekivani rezultat

- U Lovable web preview-u import više neće pasti sa `Missing required OPFS APIs`, nego će odmah prikazati jasnu desktop-only poruku.
- U stvarnom Electron prozoru import će ići kroz SQLite/OPFS bez pokušaja učitavanja pogrešnog HTML fajla kao WASM.
- CSP ostaje stroga: bez `unsafe-eval`, bez remote skripti.