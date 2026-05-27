# P3 PR-8 finale — "Pure Desktop" odluka

Cilj: ukloniti web build kao podržan target i preusmjeriti svu kompleksnost u Electron+SQLite stack. Nakon ovog PR-a, `bun run dev` i dalje radi u browseru za dev preview (HMR komfor), ali production artefakt je **isključivo Electron paket**. Sve runtime grane "browser fallback" se brišu.

## Zašto sada

- PR-7 (read-path) i PR-8 M1–M4 (SQLite adapter) ostavili su sustav s **dvostrukim invariantama** koje trošimo da održimo bezvrijedan target: OPFS fallback na `:memory:`, IDB outbox WAL (jer SW ne garantira persist), BroadcastChannel hookovi u event-busu, service-worker keširanje, manifest/PWA tagovi. Memorija `desktop-only` već to potvrđuje kao smjer — ovo je completion.
- Svaki sat održavanja browser putanje koči SQLite primary cutover (PR-9).

## Scope — što se mijenja

### 1. Build & dist (artifact-only desktop)

- `package.json`: dodati `"build:web": "echo 'Web build deprecated — Pure Desktop' && exit 1"` placeholder; preimenovati postojeći `build` u `build:renderer` (Vite produces `dist/`) i dodati `build:desktop` koji lanca `build:renderer` + `electron-packager`. `build` ostaje alias za `build:renderer` jer ga koristi Lovable harness za type-check; produkcijska distribucija ide kroz `build:desktop`.
- `vite.config.ts`: `define.__DESKTOP_ONLY__ = true`. Nema novih plugina.
- Brisanje PWA površina:
  - `public/sw.js` — DELETE.
  - `public/manifest.json` — DELETE.
  - `index.html` — ukloniti `<link rel="manifest">` i `<meta name="theme-color">` PWA setove (zadržati osnovne `<meta>` tagove; Electron ih ignorira ali ne smetaju dev pregledu).
  - `src/main.tsx` linije 103–115 — ukloniti cijeli `serviceWorker` registracijski blok i unregister cleanup. Pure delete.

### 2. Runtime grane — kolaps `isElectron()` na konstantu

- `src/lib/electron-integration.ts`:
  - `isElectron()` ostaje (mali no-op u dev browseru) ali dobiva komentar "vraća `false` samo u Vite dev pregledu; production assertion".
  - Dodati `assertDesktop()` koji throwa ako `!isElectron()` u `import.meta.env.PROD`. Pozvati ga jednom iz `main.tsx` prije `createRoot`.
- Pozivna mjesta `isElectron()` (8 fajlova iz `rg`): **ne brisati grane sada** — `assertDesktop()` jamči da production nikad ne uđe u else granu, pa one postaju mrtve u produkciji ali žive u dev pregledu. PR-9 čisti grane jednu po jednu kad nestane potreba za dev browser previewom.

### 3. Persistence — SQLite postaje primarni

Ovo je razlog cijelog PR-a; sada se može jer više nema "ali što ako browser":

- `src/lib/persistence/adapter-factory.ts`: defaultni izbor postaje `opfsSqliteAdapter` umjesto `idbOutboxAdapter` **kad** `migrated-from-idb-v1` flag postoji. Inače mirroring (IDB primary, SQLite secondary) dok migracija ne kompletira na sljedećem bootu.
- `src/lib/persistence/persist-queue.ts` (module init): pozvati `__setPersistAdapter(getDefaultAdapter({ enableSqlitePrimary: true, migrationComplete: hasMigrationFlag(), isElectron: true }))`. `hasMigrationFlag()` je sync (`localStorage`-cached kopija SQLite kv reda, set od strane `migrate-from-idb.ts`).
- IDB `outbox` tablica: **ne brisati u ovom PR-u**. Dexie v23 drop ide u PR-9 nakon jedne release cikluse na primarnom SQLite-u radi rollback safety.

### 4. Event-bus & drafts cleanup

- `src/lib/event-bus.ts` već je očišćen od BroadcastChannel/heartbeat (memorija to potvrđuje) — provjeriti i ukloniti zaostale komentare koji reference web koordinaciju.
- `src/lib/drafts/draftRegistry.ts` komentar linije 10 mijenja se iz "BroadcastChannel can plug in" u "single-process draft tracker; cross-window ne postoji u Electron singleton modu".

### 5. Vite copy plugin za SQLite WASM

Ovo je bilo deferred u PR-9 ali je preduvjet za production Electron koji loada s `file://`:

- Dodati `vite-plugin-static-copy` (mala dep) ili ručni `closeBundle` hook koji kopira `node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/*` u `dist/sqlite/`.
- `src/lib/persistence/sqlite/client.ts`: dodati `locateFile` callback koji u produkciji vraća `./sqlite/${file}` (radi pod `file://`).

### 6. Testovi i verifikacija

- Postojećih 8 SQLite testova mora i dalje proći.
- Dodati `src/test/adapter-factory.test.ts` (3 testa): (a) bez flaga → mirroring s IDB primarom, (b) s flagom → SQLite primarno, (c) dev browser → throw iz `assertDesktop` samo u PROD.
- Manualni smoke checklist u PR opisu: cold boot bez SQLite reda → migracija → restart → SQLite primary; write burst (1000 kartica) → restart → svi prisutni; namjerni kill u sredini write-a → recover bez korupcije.

## Tehnički detalji

```text
Prije:                                Poslije:
┌────────────┐                        ┌────────────┐
│  Browser   │ ← supported            │  Browser   │ ← dev preview only
│  (IDB+SW)  │                        │ (assertDesktop throws in PROD)
├────────────┤                        ├────────────┤
│ Electron   │ ← supported            │ Electron   │ ← only production target
│ (IDB+SW)   │                        │ (SQLite primary, IDB mirror)
└────────────┘                        └────────────┘
```

Adapter izbor nakon ovog PR-a:

```text
boot → runSchema → Step4 migrate-from-idb → set flag
         ↓
persist-queue init → adapter-factory:
  flag set?   → opfsSqliteAdapter (primary)
  flag unset? → MirroringAdapter(idb primary, sqlite secondary)
```

## Out of scope (ostaje za PR-9)

1. Brisanje IDB `outbox` tablice (Dexie v23 migration).
2. Kolaps `category-deletion-service.ts` na single `DELETE FROM categories` (FK CASCADE).
3. Read-path migracija s Dexie LiveQuery na SQLite + TanStack Query (planner, examiner, drafts).
4. Brisanje `isElectron()` else grana u 8 callsiteova.
5. Skidanje `dexie` deps nakon što sve tablice migriraju.

## LOC procjena

- Brisanje: ~250 (sw.js, manifest.json, SW registracija u main.tsx, PWA meta u index.html, BroadcastChannel komentari).
- Dodano: ~120 (assertDesktop, adapter-factory cutover, Vite WASM copy, locateFile, 3 testa).
- Modificirano: ~40 (package.json scripts, persist-queue init, adapter-factory branch).
- Net: **−90**, i otvara vrata za −1500 u PR-9.

## Rizici i mitigacija

| Rizik | Mitigacija |
|---|---|
| Dev preview lomi se zbog `assertDesktop` | Gate iza `import.meta.env.PROD`; dev ostaje funkcionalan |
| Postojeći korisnici s IDB-only podatcima | Mirroring adapter zadržava IDB write dok migracija ne kompletira |
| WASM ne loadira pod `file://` | `locateFile` + Vite copy plugin verificiran u Electron smoke testu |
| Service worker već registriran kod userâ | Prije brisanja registracije ostavlja se 1 release `unregister()` cleanup u main.tsx (već postoji u liniji 105–110) → tek u **idućem** PR-u brisati cleanup |

Korekcija točke 1.: **ne** brisati cijeli SW blok u main.tsx — zadržati samo `unregister` granu (cleanup za postojeće instalacije), ukloniti `register` poziv. Pure delete ide u PR-9.
