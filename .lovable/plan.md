
## Dijagnoza

Aplikacija **bootuje uspješno** (`cards:ready` u 10.7s), ali u Lovable browser preview-u cold start često prelazi **20s splash timeout** u `index.html`, pa `splash` retry skript radi `window.location.reload()` (vidi se "Pokušaj 2 od 3", "Pokušaj 3 od 3"). Svaki reload **kvari** boot:

- briše Vite dep-cache warm-up
- briše SQLite WASM kompilaciju
- restartuje cijeli boot DAG iz nule

Pa retry zapravo **pogoršava** problem koji navodno rješava.

### Konkretni boot timeline (iz console loga, topli cache):

```text
0ms      main:module-start
1ms      main:parallel-import-start
6749ms   main:parallel-import-done   ← 6.7s na Promise.all 6 dyn-importa (uključujući ./App)
7115ms   main:react-render-done
7207ms   cards:init-start
10560ms  cards:sqlite-prewarm-done   ← 3.3s na cold SQLite WASM init
10630ms  cards:schema-done           ← schema +70ms
10705ms  cards:data-load-done        ← seedDefaultCategories +52ms
10706ms  cards:ready
```

Cold start (bez Vite dep-cache) lako prelazi 20s → splash reload → još hladniji start → još jedan reload → eventualno fallback UI ("Aplikacija se učitava duže nego što je očekivano").

### Uska grla

| # | Korak | Trajanje | Uzrok |
|---|---|---|---|
| B1 | `Promise.all` u `main.tsx:137-151` | ~6.7s | uvozi `./App` koji povlači cijeli React graf prije nego što splash može da bude jedan request, dyn import čeka Vite optimize-dep |
| B2 | `cards:sqlite-prewarm` u `bootDb.ts:30-37` | ~3.3s | čeka `sqlite-wasm` module load + `installOpfsSAHPoolVfs` ili dev-fallback `initSqliteWasm` — serijski **nakon** B1 |
| B3 | Splash timeout = 20s, MAX_RETRIES = 2 (browser) | — | premali budžet za cold start preview-a; reload kvari Vite cache |
| B4 | Panic timer 22s u `useCardBootstrap.ts:70-87` | — | i ovaj može da pukne u sporom cold startu i pokaže lažni "load-error" |

## Plan rješenja (4 male, ciljane izmjene)

### Fix 1 — Podigni splash timeout i ograniči retries u DEV/browseru
**`index.html`** (linije 101-132): povisi prag i eliminiši kontraproduktivne reload-ove kad nismo u Electronu.

- `TIMEOUT`: Electron 8s ostaje; browser **20s → 45s** (cold Vite + WASM lako pređe 20s, a 45s je još uvijek mnogo manje od korisnikove tolerancije za bijeli ekran).
- `MAX_RETRIES`: Electron 1 ostaje; browser **2 → 0** (reload kvari dep cache; bolje pokazati fallback "Osveži aplikaciju" odmah nego ulaziti u petlju gdje svaki reload usporava sljedeći).
- Dodati kratku poruku u `splash-status` koja kaže "Pripremam bazu, ovo može da traje do 30s pri prvom učitavanju..." nakon 8s, da korisnik ne misli da je zaglavljeno.

### Fix 2 — Pomjeri SQLite prewarm sa kritične putanje
**`src/hooks/card-bootstrap/bootDb.ts`** (linije 21-45): trenutno `await getOpfsSqliteExecutor()` blokira boot 3.3s. Umjesto blokiranja, pokreni prewarm **paralelno** sa `runSchema` priprema:

- Pokreni `getOpfsSqliteExecutor()` kao `Promise` ali ga **ne await-uj** u `bootDb`. Sačuvaj promise.
- `runSchema` Step 4 i `loadInitialData` već implicitno koriste executor preko prvog SQL poziva; oni će prirodno await-ovati isti singleton promise kada im zatreba.
- Net efekat: prewarm preklapa sa migration sentinel check-om i `seedDefaultCategories` SQL pripremom.

### Fix 3 — Paralelizuj `main.tsx` import sa SQLite prewarm-om
**`src/main.tsx`** (linije 134-153): trenutno se 6.7s `Promise.all` izvršava prije nego što React stigne da se mountuje. Pokreni SQLite WASM init **paralelno** sa tim import-om (i prije nego što React mount-uje), tako da kad `useCardBootstrap` effect pukne, executor je već topao:

- Odmah nakon `markBootStep("main:parallel-import-start")` (linija 136), trigger-uj `import("./lib/persistence/sqlite/client").then(m => m.getOpfsSqliteExecutor())` kao **fire-and-forget**. Tako WASM kompilacija ide u paraleli sa cijelim `./App` resolve-om.
- Isti singleton se kasnije await-uje u `bootDb`. Štedi ~3s sa kritične putanje.

### Fix 4 — Uskladi panic timer
**`src/hooks/useCardBootstrap.ts`** (linija 87): trenutni 22s panic je preuzak ako je splash sad 45s. Povisiti na **35s** da bi splash retry/fallback uvijek bio raniji signal od panic toasta — sprečava `LOAD_FAIL` toast na inače validnom (sporom) cold startu.

## Verifikacija

1. `bunx tsc --noEmit` — 0 errors.
2. Test: `src/test/boot-deferred-cards.test.ts` + dodati novi guard koji verifikuje da `getOpfsSqliteExecutor` može da se pozove prije nego što se SQL koristi (idempotent singleton).
3. Manual: hard refresh u preview-u, mjeri vrijeme do `cards:ready` — cilj ≤8s u toplom cache-u, ≤30s u potpuno hladnom.
4. Verifikuj da se "Pokušaj X od Y" više **ne** pojavljuje pri normalnom cold startu.

## Što **ne** radimo (out of scope)

- Ne diramo Electron PROD boot (radi pod 8s, granica je dobra).
- Ne diramo SQLite schema/migration kod — nije uzrok.
- Ne uvodimo SW/Service Worker keširanje WASM — Pure Desktop arhitektura zabranjuje SW.
- Ne refaktorišemo `Promise.all` u main.tsx (rizik za boot stabilnost; Fix 3 daje 90% benefita sa 5 linija).
