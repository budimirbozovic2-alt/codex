# PR-H-ELECTRON: Audit nalazi Electron builda

Pozadinski agent je prošao kroz `main.cjs`, `electron/*.cjs`, `preload.cjs`, `vite.config.ts`, `package.json`, OPFS/SQLite pipeline i bundle. 3 critical + 5 high + 7 medium + 7 low. Predlažem podelu na **3 bundla** prema riziku — C-bundle ide odmah jer C-1 je tihi data-loss bug uveden u PR-H-OPFS.

---

## Bundle 1 — PR-H-OPFS-FIX (critical, hitno)

### C-1 — COOP/COEP NIJE primijenjen na `app://` (silent OPFS degradacija)
**`main.cjs:310–338, 354–377`**
`protocol.handle('app', ...)` Response objekti zaobilaze `session.webRequest.onHeadersReceived`. Posledica: `crossOriginIsolated === false` u packed buildu, `installOpfsSAHPoolVfs` undefined, client.ts fallback-uje na **in-memory** → svi user podaci se gube na restart. Dev je radio jer Vite ide kroz HTTP koji headere ima.

**Fix:** Centralizovati `ISOLATION_HEADERS` konstantu i ubaciti je u SVAKI `new Response(...)` unutar `protocol.handle('app', ...)` (sve grane: success, fallback `serveIndex`, traversal block, catch). `onHeadersReceived` ostaje samo za dev/HTTP.

### C-2 — `.wasm` nije u `MIME_TYPES` mapi
**`main.cjs:296–302`**
`sqlite3.wasm` se servira kao `application/octet-stream` → `WebAssembly.instantiateStreaming` ne radi, prelazi na sporiji ArrayBuffer path (i pod strogim CSP-om može biti blokiran).

**Fix:** dodati `'.wasm': 'application/wasm'`.

### H-4 — `wasm-locator.ts` u dev modu vraća `./sqlite/` koji ne postoji
**`src/lib/persistence/sqlite/wasm-locator.ts:38–41`**
`sqlite3-opfs-async-proxy.js` i `sqlite3-worker1.mjs` daju 404 u Electron dev → tihi in-memory fallback. Wasm sam radi jer ide kroz `?url` import.

**Fix:** u dev grani, vratiti `/@fs/<absolute-path-to-node_modules>/...` ili dodati Vite `server.fs.allow` alias `./sqlite/` → `node_modules/@sqlite.org/sqlite-wasm/dist`.

### UX safety net za in-memory fallback (Q-3 iz audita)
**`src/lib/persistence/sqlite/client.ts`**
Kad bilo koji fallback path bude pogođen (OPFS API missing ili runtime fail), emitovati `db-degraded` event i prikazati blokirajući toast/dialog: *"Trajno čuvanje nije dostupno — promjene će biti izgubljene na restart. Restartujte aplikaciju."* Bez ovoga korisnik nikad ne sazna da je u "ghost" stanju.

### Test guards
**`src/test/pr-h-opfs-electron.test.ts` (proširenje)**
- `main.cjs` izvor sadrži `'application/wasm'`.
- `main.cjs` Response konstruktori unutar `protocol.handle('app',` sadrže `Cross-Origin-Embedder-Policy` (regex preko bloka).
- `wasm-locator.ts` dev grana ne vraća literalno `"./sqlite/"`.
- `client.ts` ima event emitter za degraded state.

---

## Bundle 2 — PR-H-BACKUP-IPC (high — backup + IPC stabilnost)

### H-1 — `defaultAssertTrustedSender` u helpers prihvata svaki localhost port
**`electron/window.cjs:96–106`, `electron/backup.cjs:13–14`**
Pinned port iz PR-G8 ima rupu: ako buduća izmena u `main.cjs` zaboravi da injectuje guard, fallback otvara širi trust surface.

**Fix:** zamijeniti fallback sa `throw new Error('assertTrustedSender must be injected')` u oba fajla.

### H-2 — Streaming backup nema kumulativni size cap
**`electron/backup.cjs:125–137`**
`backup-stream-chunk` može upisati GB na disk. `MAX_BACKUP_BYTES` (200 MB) važi samo za non-streaming put.

**Fix:** module-level `activeStreamBytes`, increment + provjera, na prekoračenje close+unlink, vrati false.

### H-3 — Concurrent `backup-stream-start` leak-uje file handle
**`electron/backup.cjs:109–122`**
Drugi `start` prepiše `activeStreamFile` bez da zatvori prvi.

**Fix:** guard na vrhu: ako postoji aktivni stream, close + unlink + reset prije otvaranja novog.

### H-5 — `ipcMain.once('renderer-ready')` race posle crash recovery
**`electron/window.cjs:216–228, 267`**
`removeListener` za `once` no-op kad je već okinut. Posle drugog crash-a, nova i stara once-grana mogu se utrkivati.

**Fix:** token-based pristup — `let currentReadyToken = Symbol()`, novi prozor postavlja svoj token; handler ignoriše ako se token promijenio. Ili centralizovati u EventEmitter sa `removeAllListeners` na recovery.

### M-7 — backup timestamp slice/regex fragilan par
**`electron/backup.cjs:78`**

**Fix:** ekstrahovati `formatBackupTimestamp()` koju koristi i write i `parseTimestampFromName`.

### Test guards
**`src/test/pr-h-electron-backup.test.ts` (novi)** — unit + source guards.

---

## Bundle 3 — PR-H-BUILD-CLEANUP (medium/low — packaging + bundle)

### C-3 — `build/app-icon.icns` ne postoji → `dist:mac` crash
**`package.json:57`**
**Fix:** generisati `.icns` iz postojećeg `app-icon.ico` preko `iconutil` skripte u `scripts/`, ili promijeniti put na `public/app-icon.icns` posle generisanja. Dodati u `build/` folder.

### M-2 — `manualChunks` nema catch-all vendor bucket
**`vite.config.ts:92–104`**
**Fix:** na kraju vratiti `return 'vendor-misc'`. Pokupi `mammoth`, `jszip`, `comlink`, `date-fns`, `zod`, `zustand`.

### M-3 — `build.sourcemap` nije eksplicitno `false`
**Fix:** dodati u `build:` blok, zaštita od accidental flag-a.

### M-6 — `setPermissionCheckHandler(() => false)` lomi clipboard paste
**`main.cjs:342–345`**
**Fix:** whitelist `['clipboard-read', 'clipboard-sanitized-write']`.

### O-2 — kopiraj i `index.mjs` u `copySqliteWasmPlugin`
**`vite.config.ts:24`** — defensive, 2 min.

### O-5 — OPFS dijagnostika ide kroz `logger.warn` koji je u `esbuild.pure` listi → ćuti u prod
**`vite.config.ts:80–81`, `src/lib/persistence/sqlite/client.ts`**
**Fix:** OPFS-related logove rutirati kroz `logger.error` ili direktno `window.electronAPI.logError` IPC, ne `console.warn`.

### O-6 — `react-window` u `optimizeDeps.include` (~50–100ms cold dev start).

### M-4, M-5 — code signing + auto-updater
**Odluka:** odložiti u zasebne PR-ove (M-4 ~1h, M-5 ~2–4h). Plan ih ne implementira, samo dokumentuje u `.lovable/plan.md` kao "next".

---

## Verifikacija (svaki bundle)

1. `bunx tsc --noEmit` → 0 grešaka.
2. `bunx vitest run pr-h pr-g cards-e2e-smoke`.
3. **Bundle 1 manualno**: napakovati Electron, otvoriti DevTools, izvršiti `self.crossOriginIsolated` → mora `true`. U Network tabu `sqlite3.wasm` mora imati `Content-Type: application/wasm` i `Cross-Origin-Embedder-Policy: require-corp`. Ugasiti aplikaciju, opet otvoriti — podaci iz SQLite moraju ostati.

---

## Predloženi redoslijed

1. **Bundle 1 odmah** (silent data-loss, ~1.5h).
2. **Bundle 2** narednom prilikom (~1h).
3. **Bundle 3** kao cleanup (~1–2h).
4. M-4 / M-5 → odvojeni PR-ovi kad krene distribucija.

## Ne diram

- Renderer state mašinu (TanStack/SQLite SSOT) — nalazi su isključivo build/transport sloj.
- Persistence repo logiku — popravlja se samo header pipeline i UI signal za degraded state.