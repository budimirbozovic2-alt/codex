# PR-H-OPFS: Fix OPFS u Electron-u (app:// protokol)

## Dijagnoza

OPFS-SAH-pool VFS (`installOpfsSAHPoolVfs`) zahteva **cross-origin isolation** u Chromium-u jer interno koristi `SharedArrayBuffer` + `Atomics.wait` u dedikovanom OPFS proxy worker-u. Cross-origin isolation se uključuje samo kada server šalje:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

`main.cjs` trenutno postavlja CSP ali **ne i COOP/COEP**, pa Chromium pod `app://localhost` ne aktivira `crossOriginIsolated`. Posledica: `sqlite3.installOpfsSAHPoolVfs` je `undefined`, `client.ts` baca `OPFS_UNAVAILABLE`, a u Electron PROD grani nema fallback-a → svaki repo poziv (npr. `bulkPutCategories`) baca `NO_EXECUTOR`.

(Napomena: korisnikov opis "pada na Dexie" je zastareo — Dexie je u Phase C potpuno uklonjen. Stvarno se događa: OPFS init fail → `NO_EXECUTOR` u svakom write-u.)

Sporedni problem: čak i kad COOP/COEP rade, sva tri sqlite asset-a (`sqlite3.wasm`, `sqlite3-opfs-async-proxy.js`, `sqlite3-worker1.mjs`) moraju se serviraju sa `Cross-Origin-Resource-Policy: same-origin` da bi worker mogao da ih učita pod izolacijom.

## Plan izmena

### 1. `main.cjs` — COOP/COEP + CORP za `app://`
- U postojećem `onHeadersReceived` hooku, za sve `app://` odgovore dodaj:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Resource-Policy: same-origin`
- Ostavi CSP nepromenjen (već je `'self' app:`).
- Dev grana (`isDev`): isto postavi COOP/COEP na Vite dev odgovore preko novog `onHeadersReceived` filtera, da bi se OPFS testirao i u dev modu pod Electron-om.

### 2. `electron/window.cjs` — webPreferences flag (opciono)
- Dodaj `webPreferences.webSecurity: true` (default je već `true`, ali eksplicitno).
- Verifikuj da `sandbox: true` ne blokira OPFS-SAH-pool worker — ako da, suzimo na `sandbox: false` samo za main window (preload ostaje contextIsolated). Najpre testirati sa trenutnim `sandbox: true`.

### 3. `src/lib/persistence/sqlite/client.ts` — bolja dijagnostika
- Pre poziva `installOpfsSAHPoolVfs`, loguj `self.crossOriginIsolated`, `typeof SharedArrayBuffer`, i da li `navigator.storage?.getDirectory` postoji. Ovo pravi razliku između "OPFS API missing" vs "SAB missing zbog COOP/COEP".
- U Electron PROD grani, ako OPFS i dalje fail-uje posle ovih headera, **nemoj** odmah throw-ovati — pokušaj jednom `getDevFallbackExecutor()` (in-memory) i prikaži toast-warning da rad nije durable + uputu da resetuju app. To sprečava potpuni boot crash i daje user-recoverable putanju.

### 4. `vite.config.ts` — COOP/COEP u dev serveru
- `server.headers`: dodaj `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. Bez ovoga OPFS u `bun run dev + Electron` neće raditi (isti razlog kao PROD).

### 5. `src/test/pr-h-opfs-electron.test.ts` (novi)
- Guard: `main.cjs` izvor sadrži oba header stringa.
- Guard: `vite.config.ts` izvor sadrži `Cross-Origin-Embedder-Policy`.
- Guard: `client.ts` ima fallback granu u Electron PROD koja ne throw-uje sinhrono za nedostatak OPFS-a.

## Verifikacija

1. `bunx tsc --noEmit` — 0 grešaka.
2. `bunx vitest run pr-h-opfs pr-h1 pr-h2 cards-e2e-smoke`.
3. Manuelni: pokreni Electron build, otvori DevTools, proveri `self.crossOriginIsolated === true`. Boot log treba da prijavi `[sqlite] opened OPFS-SAH-pool DB`.

## Ne diram

- Persistence/adapter sloj (SQLite-only model, repos, mutations) — popravlja se samo *boot transport* sloj.
- Dexie/IDB migracija (već Phase C).
- Memory `mem://architecture/opfs-sqlite-adapter` — ostaje validna, dodaj samo notu o COOP/COEP zahtevu kao "Why" u Why-bloku posle implementacije.