# Deep Audit — Konsolidovani plan sanacije

Tri paralelne analize (boot/lifecycle, persistence/mutacije, arhitektura/dead-code) otkrile su **30 nalaza**. Ovo je prioritizovan plan po riziku za podatke, ne po fajlovima.

---

## WAVE 1 — Tihi gubitak podataka (kritično, sanirati prvo)

Sva tri nalaza znače da korisnik vidi "uspjeh" u UI-ju, a podaci nisu u SQLite-u.

### 1.1 · DOCX import nikad ne piše kartice u SQLite
`src/hooks/useCardImport.ts:198` zove `cardMapBulkPut(created)` (sync Zustand) bez `persistQueue.schedule`. Kartice se pojave u UI-ju, nestanu na reload. **Fix:** dodati `persistQueue.schedule({ type: "bulk", cards: created })` ili migrirati na `bulkPutAsync`.

### 1.2 · `categoryRepository.commit` guta greške i ima race u snapshot-u
`src/lib/repositories/categoryRepository.ts:67–82` hvata SQLite grešku, rolbekuje RAM, prikaže toast, ali **ne re-throw-a** — pozivaoci misle da je save uspio. Dodatno, `snapshot = getCategoryStoreRecords()` se uzima **prije** `_saveMutex.runExclusive`, pa drugi concurrent `commit` snima već dirty snapshot prvog. **Fix:** premjestiti snapshot capture unutar mutexa, re-throw greške.

### 1.3 · `db-seed` vraća in-memory defaults i kad write padne
`src/lib/db-seed.ts:43–54` na grešku `bulkPutCategories` ipak vrati `defaults`. Sledeći boot — `listAllCategories()` prazan → seed se pokrene **ponovo** sa novim UUID-ovima. Sve kartice koje referenciraju stare UUID-ove postaju siročad. **Fix:** re-throw iz catch-a (ne vraćati defaults).

### 1.4 · `categoryRepository.deleteAsync` tiho vraća OK kad executor je null
`src/lib/repositories/categoryRepository.ts:120–121`. RAM kaže obrisano, SQLite zadrži red, kategorija se vrati na boot. **Fix:** `throw new Error("NO_EXECUTOR")` umjesto `return`.

### 1.5 · `runMany` u SQLite client-u nema transakciju
`src/lib/persistence/sqlite/client.ts:96–103` — hot path za bulk write. Greška u sredini → reda 1..N-1 commitovani, N..end izgubljeni, bez rollback-a. **Fix:** umotati u `BEGIN`/`COMMIT`/`ROLLBACK`.

### 1.6 · `:memory:` fallback u OPFS client-u bez signala pozivaocu
`src/lib/persistence/sqlite/client.ts:68–71` tiho zamijeni durable OPFS sa transientnim `:memory:` DB-om. Komentar sam kaže "adapter factory should not select us here", ali ne postoji runtime guard. **Fix:** reject promise umjesto fallback-a, ili izložiti `window.__codexDbDurable=false` koji health monitor surfajzuje kao trajni warning.

---

## WAVE 2 — Boot stabilnost i splash flasteri

### 2.1 · `useCardBootstrap.ts:143` — `SchemaError.cause` uvijek `"unknown"`
Dead ternary: `error instanceof SchemaError ? "unknown" : "unknown"`. Bila je tu `error.step`. Recovery UI nikad ne prikaže koji korak je pao. **Fix:** `error instanceof SchemaError ? error.step : "unknown"`.

### 2.2 · Panic timer (15s) racuje sa migration `withTimeout` (15s)
`useCardBootstrap.ts:55` i `runSchema.ts:80` koriste istih 15s. Panic fire-uje *tokom* migracije, transitnira u `schema-error`, migracija odmah nakon toga rezolvira lažno OK. **Fix:** panic ≥ 22s ili migration timeout ≤ 10s; uskladiti.

### 2.3 · `__codexAppMounted` se postavlja **prije** React commit-a
`src/main.tsx:153,160` — `createRoot().render()` u React 18 je async; flag se postavi sinhronio na sledećoj liniji, prije bilo kog effect-a. **Fix:** premjestiti `window.__codexAppMounted = true` + `clearTimeout(__codexSplashTimer)` u `finally` blok `useCardBootstrap`-a, nakon `setReady(true)`.

### 2.4 · Splash retry: 60s totalni hang prije fallback-a
`index.html:103,124` — 20s × (MAX_RETRIES=2 + 1). Treba environment-aware: `var TIMEOUT = window.electronAPI ? 8000 : 20000; var MAX_RETRIES = window.electronAPI ? 1 : 2;`. Nakon 2.3, retry je u praksi nepotreban.

### 2.5 · CSP nedostaje `'wasm-unsafe-eval'`
`index.html:9` meta-tag CSP nema `'wasm-unsafe-eval'` u `script-src`. U Chromium-u 95+ ovo je potrebno za WASM. Glavni `main.cjs` headeri možda jesu, ali meta-tag se evaluira u nekim modovima — može izazvati upravo "expected magic word" failure protiv kojeg `locateFile` workaround pokušava da brani. **Fix:** dodati `'wasm-unsafe-eval'` u `script-src` u meta i u `main.cjs`.

### 2.6 · `withTimeout` vraća fallback bez signaliziranja
`src/hooks/card-bootstrap/withTimeout.ts:4–14`. Pozivaoci ne razlikuju "timeout vratio prazan array" od "stvarno prazan". `seedDefaultCategories` sa fallback `[]` i 2.5s budgetom → app boot-uje bez kategorija, bez greške. **Fix:** vratiti `{ value, timedOut: boolean }`, kritični pozivaoci moraju emitovati `LOAD_FAIL`.

---

## WAVE 3 — Persistence queue i mutacije

### 3.1 · `persist-queue.ts:180–191` — `NO_EXECUTOR` tihi gubitak
Bez retry, bez toast-a. Pendingi su re-enqueueovani, ali jedini safety net je visibility change. **Fix:** prikazati distinkt toast, cap retries.

### 3.2 · `persist-queue.ts:202–206` — race između `schedule` timera i visibility flush
Nema `isFlushRunning` boolean guard-a. **Fix:** entry guard u `flush()`.

### 3.3 · `persist-queue.ts:210–227` — `cleanup()` ne drain-uje retry-jeve
Jedan poziv `flush()`, pa provjeri `inFlightCount`. Ako je flush re-enqueueovao items na novi timer, cleanup vrati a items i dalje pending. **Fix:** `while (hasPending()) { await flush(); ... }` sa cap-om na MAX_RETRY+1.

### 3.4 · `opfs-sqlite-adapter.ts:29` — bare `catch {}` gubi originalni error
WASM load fail, OPFS denial, quota error — svi se izgube. **Fix:** `Object.assign(new Error("NO_EXECUTOR"), { cause })` + `logger.error`.

### 3.5 · `useSourceMutations.ts:58–63,86–89` — double invalidacija maskira slomljen bridge
Komentar admituje da `_notify` bridge propušta nakon HMR-a. Root: `installQueryBridges` koristi modul-level `_installed = true` koji HMR ne resetuje. **Fix:** `import.meta.hot?.dispose(_resetBridgesForTest)`, pa skinuti `onSuccess` safety net-ove.

---

## WAVE 4 — Mrtav kod i deprecated scaffolding

### 4.1 · `src/lib/feature-flags.ts` — obrisati cijeli modul
`REGISTRY = {}`, `FeatureFlagKey = never`, 0 pozivaoca. Trap za buduće flagove (silent `false`).

### 4.2 · `src/lib/db-error.ts:44–130` — obrisati 6 Dexie-era exporta
`registerBlockedRejecter`, `unregisterBlockedRejecter`, `rejectAllBlocked`, `startUnblockWatch`, `scheduleTimeoutReload`, `emitBlockedThrottled` — 0 pozivaoca. `startUnblockWatch` sadrži raw `setInterval` koji curi timer slot za odsutni Dexie shell.

### 4.3 · `src/lib/planner-storage.ts` — obrisati shim
Jedna linija `export * from "@/domains/planner"`, 0 pozivaoca, ali ima permanentnu rupu u ESLint W11–W13 `ignores` listi.

### 4.4 · `src/features/mnemonic/mnemonic-storage/migrate.ts` — obrisati legacy migration
`migrateMnemonicsFromLocalStorageToIDB` čita localStorage ključeve koji ne postoje od v22. Re-export kroz tri barrel sloja.

### 4.5 · `src/lib/db-types.ts` — ukloniti `htmlContent?` i `content?` deprecated polja sa `Card`
0 write-pathova, ali tip dozvoljava silent undefined u JSON payload-u. Stara payload-a hendlovati eksplicitno u `decodeCard`.

### 4.6 · `runSchema.ts:44–55` Steps 1+2 — sentinel-gate ili obrisati
`migrateFromLocalStorage` i `migrateMnemonicsFromLocalStorageToIDB` se izvršavaju na **svaki** non-Electron boot, no-op za sve realne korisnike. Dodaje ~6s slow path-u. **Fix:** `localStorage.setItem("codex-migrations-clean","1")` sentinel ili brisanje.

### 4.7 · `src/main.tsx:195–212` — Service Worker cleanup blok
Komentar sam kaže "Scheduled for full removal in PR-9". PR-9 je završen. **Fix:** obrisati ili `sessionStorage` one-shot guard.

### 4.8 · `src/main.tsx:126–127` — `assertDesktop()` redundantni async import
Outer `isDesktopShell` gate već garantuje uslove. **Fix:** static import na vrh ili obrisati.

### 4.9 · `src/lib/db.ts` — pure re-export barrel sa pogrešnim imenom
Fajl koji se zove `db.ts` re-exportuje samo `db-seed.ts`. **Fix:** redirektovati pozivaoce na `@/lib/db-seed`, obrisati shim.

---

## WAVE 5 — Niže rangirani higijena nalazi

- **DOCX worker:** `useDocxImportFlow.ts:57–79` zove `mammoth.convertToHtml` na main thread-u; cijela `docx-parser.ts` worker infrastruktura je dead code. Plus `docx-parser.ts:46` transferuje **kopiju** ArrayBuffer-a (`arrayBuffer.slice(0)`), original ostaje na main thread-u, worker primi prazan buffer. → wire worker, fix transfer list.
- **`docx-worker.ts`** — odbacuje mammoth warnings, nema `self.onerror`.
- **`ExportImportDialog.tsx:76`** — bare `catch {}`.
- **`db-seed.ts:64`** — bare `catch {}` na localStorage cleanup.
- **Komentari koji lažu:** `db-error.ts:24`, `healthService.ts:67`, `AppContext.tsx` header (referencira uklonjene Provider-e), `bootDb.ts:25` ("8s panic timer" → sad 15s).
- **ESLint walls W6/W7/W8 unlabelled** — `eslint.config.js` numbering nedosljedan.

---

## Redoslijed implementacije i validacija

1. **Wave 1** (svih 6) prvo — direktan rizik za podatke. Testovi: dodati 5 kategorija uzastopno, restartovati app, provjeriti da sve ostaju; importovati DOCX, restartovati, provjeriti kartice; pad-fault sa onemogućenim OPFS (DEV) → očekuje toast, ne tihi gubitak.
2. **Wave 2** (boot stabilnost) — eliminacija svih reload/panic flastera. Validacija: spori cold boot (throttle CPU 4×) ne smije producirati lažni `schema-error`; mount signal mora doći iz stvarnog ready stanja.
3. **Wave 3** (queue/mutacije) — fix HMR bridge pa skinuti `onSuccess` flaster.
4. **Wave 4** (dead code) — siguran cleanup, manja površina za buduće bugove.
5. **Wave 5** — kozmetika i komentari.

Svaki wave: zaseban testni prolaz + run vitest. Backup/import e2e test (`card-import-flow-e2e.test.tsx`) mora biti zelen nakon Wave 1.

---

## Tehnički detalji

Konkretne file:line lokacije i predloženi patch-evi su iznad. Ovo nije refactor projekat — preko 70% promjena su 1–5 linija po fajlu. Najveći diff je verovatno Wave 4.1+4.2+4.3+4.4 (brisanje modula), koji je čisto subtraktivan.

Bez ovog plana: bilo koji budući "tihi" gubitak podataka biće teško dijagnostikovati jer 6 različitih mjesta swallow-uje greške. Plan eksplicitno otklanja "swallow + toast + return OK" anti-pattern svuda gdje se javlja.
