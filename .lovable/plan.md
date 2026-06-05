## Cilj
Dokazati da **svaka** ruta servirana iz `protocol.handle('app', …)` (HTML, JS, CSS, WASM, woff2, png, svg, ico, json) u packaged Electron buildu nosi:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: cross-origin`
- `Content-Security-Policy: <PROD_CSP>`
- ispravan `Content-Type`

Ne samo HTML rute.

## Trenutno stanje (analiza)
`main.cjs` već koristi `buildHeaders(mime)` koji spreaduje `ISOLATION_HEADERS` + dodaje `Content-Security-Policy: PROD_CSP`. Pozvan je u obje grane `protocol.handle('app', …)`:
- `serveIndex()` → fallback / SPA root
- asset grana → `new Response(data, { status: 200, headers: buildHeaders(mime) })`

Teoretski ✅, ali nemamo automatski regresioni guard koji bi blokirao PR koji uvodi treću `new Response(...)` granu bez `buildHeaders`, niti runtime dokaz da Electron stvarno emituje te headere za sve MIME tipove.

## Plan: dva sloja verifikacije

### 1) Statički guardovi — proširiti `src/test/pr-h-opfs-electron.test.ts`
Novi `describe("PR-H-OPFS-FIX-3: every app:// Response carries isolation + CSP")` blok:

- **Test A — strukturni**: izvuci tijelo `protocol.handle('app', …)` callbacka regexom; potvrdi da **svaki** `new Response(` unutar tog bloka prima `buildHeaders(` u `headers` polju. Ako iko ikad doda `new Response(data, { headers: { 'Content-Type': mime } })` bez `buildHeaders`, test pada.
- **Test B — `buildHeaders` kompletnost**: parsiraj `buildHeaders = (mime) => ({ ... })` i potvrdi da rezultat sadrži sva 4 ključa: `Content-Type`, sva 3 isolation headera (preko spread-a `ISOLATION_HEADERS`), `Content-Security-Policy`.
- **Test C — `ISOLATION_HEADERS` vrijednosti**: hardkodovani assert da konstanta sadrži `COOP=same-origin`, `COEP=require-corp`, `CORP=cross-origin` (regresija ako ih neko stišća na `unsafe-none`).
- **Test D — MIME pokrivenost**: `MIME_TYPES` mora pokrivati minimalno `.html .js .mjs .css .json .svg .png .jpg .jpeg .ico .woff .woff2 .ttf .otf .wasm`. Ako se doda nova ekstenzija u `public/` (npr. `.webmanifest`), guard ne pada ali sprečava regresiju za postojeće.
- **Test E — fallback grana**: `serveIndex()` također koristi `buildHeaders('text/html')`, ne sirov objekt.

Cilj: 5 novih `it(...)`, sve deterministički preko `readFileSync` + regex. Bez Electron runtime-a.

### 2) Runtime smoke test — `scripts/verify-app-protocol-headers.cjs`
Mali Node skript (CommonJS) koji se pokreće iz packaged Electron builda u headless modu:

```
electron-release/MyApp-linux-x64/MyApp --verify-headers
```

U `main.cjs` dodaj `--verify-headers` argument grananje (samo kad je flag prisutan):
1. nakon `app.whenReady()` i registracije `app://` protokola, ne otvaraj prozor
2. pokreni `BrowserWindow({ show: false, webPreferences: { offscreen: true } })`
3. za svaki test URL (`/index.html`, prvi `/assets/*.js`, prvi `/assets/*.css`, `/sqlite/sqlite3.wasm`, `/fonts/fraunces-latin.woff2`, `/placeholder.svg`) izvedi `net.fetch('app://localhost/...')` (Electron `net` modul podržava custom protokol)
4. asertuj da svaki response ima sva 4 očekivana headera + ispravan `Content-Type`
5. izlistaj rezultat u JSON na stdout, `app.exit(0)` ili `app.exit(1)`

Lista URL-ova se generiše dinamički iz `dist/index.html` (parsiraj `<script src>` i `<link href>`) plus fiksni asset paths.

### 3) CI wiring (opciono, dokumentovano u planu, ne pokretano sada)
Dodaj npm skriptu:
```
"verify:app-headers": "vite build && electron . --verify-headers"
```
Statički test (1) trči u svakom `bunx vitest run`. Runtime test (2) je manuelan / pre-release jer zahtijeva Electron download (~150MB) i build (~1min).

## Tehnički detalji

### Datoteke
- **Edit** `src/test/pr-h-opfs-electron.test.ts` — dodaj `describe("PR-H-OPFS-FIX-3: …")` sa 5 testova
- **Edit** `main.cjs` — dodaj `process.argv.includes('--verify-headers')` granu prije `createWindow(...)`, koja poziva novi modul
- **Create** `electron/verify-headers.cjs` — implementacija `--verify-headers` (Electron `net.fetch` + assertion + JSON izvještaj)
- **Edit** `package.json` — `scripts.verify:app-headers`
- **Edit** `.lovable/plan.md` — sažetak za istoriju

### Izvršenje verifikacije nakon implementacije
1. `bunx vitest run src/test/pr-h-opfs-electron.test.ts` — sva 20 testa (15 postojećih + 5 novih) zelena
2. (opciono u sandbox-u) `bun add -D electron @electron/packager && npx vite build && npx electron . --verify-headers` — provjeri JSON izvještaj; svi URL-ovi moraju imati 4 očekivana headera

### Out of scope
- Bundle 2 (PR-H-BACKUP-IPC), Bundle 3 (PR-H-BUILD-CLEANUP) — odvojeni PR-ovi
- DEV server headers (Vite plugin) — već pokriven postojećim testovima
- CSP runtime validacija (eval, wasm-eval) — već pokriven u PR-H-OPFS-FIX-2

## Rizici
- `net.fetch` u Electron-u prihvata `app://` URL-ove tek od Electron 28+. Provjeriti `package.json` Electron verziju prije implementacije runtime grane; ako je niža, fallback je `BrowserWindow.loadURL` + `webContents.session.webRequest.onResponseStarted` capture.
- Regex parsing `main.cjs` je krhak na format promjene. Drži regex labav (npr. `/new Response\([^)]*headers:\s*buildHeaders/`).
