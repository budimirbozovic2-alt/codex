## Dijagnoza

Problem vjerovatno više nije COOP/COEP/CSP header. Header smoke kaže da su asset rute ispravne.

Greška `Missing required OPFS APIs` dolazi iz `@sqlite.org/sqlite-wasm`: OPFS SAH VFS traži `FileSystemFileHandle.prototype.createSyncAccessHandle` i `navigator.storage.getDirectory`, ali SQLite ga trenutno pokušava instalirati iz renderer main thread-a (`client.ts` → `initSqliteWasm()` → `sqlite3.installOpfsSAHPoolVfs()`). SQLite dokumentacija kaže da su OPFS/SyncAccessHandle API-ji za ovaj VFS dostupni u Worker kontekstu, ne pouzdano u UI thread-u. Zato dev Electron i packaged build padaju u isti in-memory fallback.

## Plan

1. **Uvesti Worker-backed SQLite executor**
   - Dodati dedicated worker modul za SQLite/OPFS, npr. `src/lib/persistence/sqlite/opfs-worker.ts`.
   - Worker inicijalizuje `@sqlite.org/sqlite-wasm`, poziva `installOpfsSAHPoolVfs()`, otvara `OpfsSAHPoolDb`, uključuje `PRAGMA foreign_keys = ON`, pokreće postojeće migracije i drži jedan trajni DB handle.
   - Renderer više ne poziva OPFS SAH direktno.

2. **Dodati typed RPC bridge između renderer-a i worker-a**
   - Uvesti minimalni request/response protocol za postojeći `SqlExecutor` surface:
     - `run(sql, params)`
     - `runMany(sql, paramsBatches)`
     - `all(sql, params)`
     - `exec(sql)`
     - `transaction(ops)` ili serialized transaction queue
     - `close()`
   - Zadržati `SqlExecutor` interfejs za ostatak aplikacije, tako da query/repository sloj ostaje isti.

3. **Transakcije riješiti deterministički**
   - Pošto trenutni API koristi `exec.transaction(async tx => { await tx.run(...); ... })`, worker wrapper mora očuvati isti oblik.
   - Najsigurnija prva implementacija: renderer-side `transaction()` kreira transaction context/ID u worker-u; svi `tx.run/tx.all/tx.exec` pozivi idu serijski kroz isti context; na kraju `COMMIT`, na grešku `ROLLBACK`.
   - Time se ne uvodi JS mutex za DB write path; samo RPC serializacija ka jednom worker-owned SQLite connection-u.

4. **Popraviti asset resolution za worker**
   - `locateFile` u worker kontekstu mora pokazivati na iste `/sqlite/*` fajlove u dev Electronu i `./sqlite/*` u packaged `app://localhost` buildu.
   - Po potrebi razdvojiti `getWasmBasePath()` za renderer vs worker, jer `import.meta.env.PROD` i relative URL u worker-u mogu drugačije resolve-ati.

5. **Učvrstiti fallback ponašanje**
   - U Electron PROD: ako OPFS worker ne može otvoriti trajnu bazu, prikazati postojeći `db-degraded` signal, ali u log ubaciti pun diagnostic snapshot iz worker-a (`crossOriginIsolated`, `hasSharedArrayBuffer`, `hasNavigatorStorage`, `hasFileSystemHandles`, `hasSyncAccessHandle`).
   - U Electron DEV: fallback može ostati in-memory, ali samo nakon što OPFS worker jasno prijavi razlog.
   - U običnom browser Vite preview-u: i dalje zadržati namjerni in-memory dev fallback jer nema `window.electronAPI`.

6. **Dodati runtime smoke test za OPFS, ne samo headere**
   - Proširiti `electron/verify-headers.cjs` ili dodati novi `electron/verify-opfs.cjs` sa `--verify-opfs` modom koji otvori realan renderer/worker kontekst i provjeri:
     - `crossOriginIsolated === true`
     - OPFS worker može otvoriti `OpfsSAHPoolDb`
     - test tabela/ključ preživi reload procesa/prozora
   - Dodati npm skriptu npr. `verify:opfs`.

7. **Test guardovi**
   - Proširiti `src/test/pr-h-opfs-electron.test.ts` da regresijski zabrani direktan `installOpfsSAHPoolVfs()` iz renderer `client.ts`.
   - Dodati test da `client.ts` koristi worker-backed executor u Electron runtime-u.
   - Zadržati postojeće header/CSP testove.

## Očekivani rezultat

- Electron dev više ne završava sa `[sqlite] DEV in-memory fallback aktivan` kada se pokrene kroz Electron.
- Packaged Electron build otvara trajnu OPFS SQLite bazu i podaci ostaju nakon restarta.
- Ako OPFS padne, log više neće biti generički; znaćemo tačno koji browser/Electron API fali.