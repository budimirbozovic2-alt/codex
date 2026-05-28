# A1c — Drop Dexie Mirror + Drop `dexie` Dep

## Recon — koliko je ovo zaista

Brzi presek trenutnog Dexie footprinta:

- **288** referenci ka `db.{cards,sources,mindMaps,mnemonics,knowledgeBaseArticles,categories,drafts,settings,plannerEntries,majorSystem,mnemonicTestLog,reviewLog,diary,disciplineLog,pomodoroLog,calibrationSamples,latencySamples,slippageSamples,activitySamples}` raspoređenih kroz **44 fajla**.
- 10 modula u `src/lib/db/queries/*` (svaki ima `tryGetExecutor()` + Dexie mirror granu).
- 2 façade keša (`sources-storage._cache`, `mindmap-storage._cache`).
- Backup/restore pipeline (`useCardExport`, `lib/backup/export-stream`, `write-cards-tx`, `write-categories-tx`, `write-satellite-tx`, `import-transaction`) je Dexie-tied.
- Heal/migracija/preflight (`runHeal`, `normalizeCategories`, `heal-card-taxonomy`, `remap-from-backup`, `lazy-migrate`, `preflight-telemetry`) čita iz Dexie-ja.
- `db-schema.ts` (Dexie schema), `db-seed.ts`, `db-queries.ts` su Dexie-only.
- **3** stvarna `import ... from "dexie"` / `dexie-react-hooks`: `useLinkedCards.ts`, `backup/export-stream.ts`, `editor-v4/preflight-telemetry.ts`, plus type-only u `migrate-from-idb.ts`.
- Tests: 10+ test fajlova mockuje ili koristi Dexie direktno.
- **Telemetry counter za `tryGetExecutor() == null` ne postoji** — to je deo preduslovne stavke koji moramo *prvo* da isporučimo.

Net: ovo nije jedan PR. Kao "A1c" pravac treba ga isporučiti kroz **4 PR-a** kojima je krajnji cilj `bun remove dexie dexie-react-hooks` + zelen `rg dexie dist/` posle `vite build`. Plan ispod fiksira tih 4 koraka i šta tačno ide u svaki.

## A1c-0 — Preduslov: SQLite-only telemetry gate

Pre nego što počnemo da brišemo Dexie grane, moramo da imamo metriku „koliko često je SQLite executor `null` u produkciji". Bez nje, „soak release bez fallback hit-ova" je tvrdnja koja se ne može verifikovati.

### Izmene

1. `src/lib/db/queries/_shared/executor-telemetry.ts` (novo): brojač + `notifyExecutorNull(domain, op)` koji emituje `executor:miss` event na već postojeći EventBus i inkrementuje module-level `executorMissCount` map (po `${domain}.${op}`).
2. U svih 10 `queries/*` modula: u svakoj `tryGetExecutor()` grani gde se vraća `null`, pozvati `notifyExecutorNull(<domain>, <op>)` pre fallback-a na Dexie.
3. `useHealthMonitor` + DevTools panel: prikazati ukupan `executorMissCount` sa per-domain breakdown.
4. Telemetry sink: u DEV log, u PROD opcioni event poslat ka postojećem `metacognitive`/`activitySamples` (sample 1:1 jer je očekivana vrednost 0).

### Definicija „soak prošao"

- 7 dana u DEV + 1 release ciklus u PROD bez ijednog `executor:miss` event-a.
- Manuelni run `health.check()` → 0 missova svih domena.

Tek kad ovo zelena ide A1c-1.

## A1c-1 — Drop Dexie write mirror u `queries/*`

Cilj: svaki `queries/*` writer pravi **samo** SQLite poziv. Ako executor nije dostupan, `assertDesktop()` baca; ne piše više nigde.

### Izmene

10 modula × isti pattern:

```text
// PRE
const exec = await tryGetExecutor();
if (exec) {
  await exec.transaction(async tx => { /* SQLite */ });
}
await db.X.put(row);   // ← mirror se uklanja

// POSLE
const exec = await tryGetExecutor();
if (!exec) {
  assertDesktop();      // baca u PROD, throw u DEV
  throw new Error("SQLite executor unavailable");
}
await exec.transaction(async tx => { /* SQLite */ });
```

Konkretni write helperi (`putAsync`, `bulkPutAsync`, `delete*`, `reparent*`, KV `putSetting`/`deleteSetting`, `putArticle`/`bulkPutArticles`, itd.) gube Dexie mirror linije. Read helperi i fallback čitači ostaju za sad — neki backup/heal modul ih još koristi (rušimo ih u A1c-2).

### Tačke uticaja van `queries/*`

- `category-deletion-service.ts`: već briše kroz `queries/cards` + Dexie mirror helpere (`deleteCardsByCategoryDexie`, itd.). Te `*Dexie` helpere obrisati zajedno sa mirror granama.
- `cardMapWrites.reloadCardsFromIdb` koristi `listAllCards`/`getCardsByIds` koji su SQLite-primary — ostaje.
- `persist-queue` writes ne diramo (oni su već iza `PersistAdapter` interfejsa; SQLite adapter je default).

### Test
- Postojeći testovi koji oslanjaju na Dexie mirror (`category-deletion.test.ts` asserti pravljeni za oba sloja) prebaciti samo na SQLite assert.

## A1c-2 — Drop Dexie fallback čitače + façade kešovi  ✅ DONE

- 10 `queries/*` modula: svi `list*`/`get*`/`find*`/`count*` helperi su sad SQLite-only kroz `requireExecutor(label)`. Ako executor nedostaje u DEV shell-u, vraćaju siguran default (`[]`, `undefined`, `0`) i logguju; PROD throw-uje kroz `assertDesktop`.
- `sources-storage.ts`: `_cache: Source[] | null` uklonjen. `loadSources()`/`loadSourcesByCategory()` su sad thin wrapperi oko `queries/sources`. `invalidateSourcesCache()` zadržan kao thin `_notify` wrapper radi backward-compat za pozivače poput `useCategoryManagement`.
- `mindmap-storage.ts`: `_cache: MindMapDoc[] | null` uklonjen. `loadMindMaps()`/`getMindMap()` idu direktno na `queries/mind-maps`. `invalidateMindMapsCache()` zadržan kao `_notify` wrapper.
- `notifyExecutorNull()` calls zadržani u `tryGetExecutor` — služe kao pasivna defense-in-depth metrika; per-call site `requireExecutor` osigurava da reads ne mogu tiho promašiti.
- Backup-readers (`backup-readers.ts`) i dalje Dexie-only za `reviewLog`/`diary`/`calibrationLog`/itd. — to ide u A1c-3.



Cilj: svaki `queries/*` read helper čita **samo** SQLite. Façade kešovi (`_cache` u `sources-storage`/`mindmap-storage`) idu napolje — TanStack QueryClient je jedini cache.

### Izmene queries/*

```text
// PRE
const exec = await tryGetExecutor();
if (exec) return decodeRows(await exec.query(SELECT ...));
return (await db.X.toArray()).filter(...);   // ← briše se

// POSLE
const exec = await tryGetExecutor();
if (!exec) { assertDesktop(); throw new Error(...); }
return decodeRows(await exec.query(SELECT ...));
```

10 query modula × svi `list*`/`get*`/`find*`/`count*` helperi.

### Façade kešovi

- `src/lib/sources-storage.ts`: ukloniti `_cache: Source[] | null`, `invalidateSourcesCache()`, kao i pripadajuće setere u CRUD putu. `loadSources()` postaje thin wrapper oko `listAllSources()` (queries layer). Konzumenti idu kroz `useAllSources`/`useCategorySources` koji su već `useQuery` (od PR-7f M2). Listeneri (`onSourcesChanged`, `onCardLinksCleared`, `onCardReviewConfirmed`) ostaju — koriste se za bridge invalidaciju, ne kao keš mehanizam.
- `src/lib/mindmap-storage.ts`: isto — ukloniti `_cache`, `loadMindMaps()` ide direktno na `listAllMindMaps()`. `useMindMaps`/`useMindMap` su već `useQuery`.

### Telemetry counter cleanup

`executor-telemetry` modul iz A1c-0 ostaje, ali `notifyExecutorNull()` više nikad ne treba da bude pozvan — sad je `tryGetExecutor()` interno (svaki call site na `null` → throw). Promenimo signaturu u `getExecutorOrThrow()` i bacamo direktno.

### Test
- `card-selectors.test`, `use-cards-by-source.test`, `category-deletion.test` već prolaze na SQLite path-u (provereno u B1).
- `sources-storage`/`mindmap-storage` integracioni testovi — ako postoje cache assert linije, ukloniti.

## A1c-3 — Backup/restore + heal/migrate pipeline cut-over  🟡 PARTIAL

Ovo je najveći chunk po LOC. Backup pipeline trenutno striming-uje Dexie tabele.

### Izmene

#### Backup/export
- `src/lib/backup/export-stream.ts`: zameniti `Dexie.Table` iteraciju sa `queries/backup-readers.listAll*` async iteratorima. Dodati `listAllReviewLog`, `listAllDiary`, `listAllPomodoroLog`, `listAllCalibration`, `listAllLatency`, `listAllSlippage`, `listAllActivity` u backup-readers (svi sad SQLite-primary — `latency`/`slippage`/`activity`/`pomodoro`/`reviewLog`/`diary`/`calibration` su SQLite tabele od PR-9 A1b P1.B).
- `src/lib/backup/write-cards-tx.ts`, `write-categories-tx.ts`, `write-satellite-tx.ts`: zameniti Dexie `rw` transakcije sa `SqlExecutor.transaction`. Idempotency tokeni već postoje na repo strani.
- `src/lib/backup/import-transaction.ts`: orchestracija ide preko SQLite tx-a; FK CASCADE već ima posao.
- `src/hooks/useCardExport.ts`: `tableSpec` i `streamBackup` se rewrite-uju da koriste nove `listAll*` iteratore.

#### Heal/migracije
- `src/hooks/card-bootstrap/runHeal.ts`: `bulkPut` ide na `cardMapWrites.bulkPut` (već postoji od B1) + per-row SQLite kroz `cardRepo.bulkPutAsync` (queries layer).
- `src/hooks/card-bootstrap/normalizeCategories.ts`: čita kroz `categoryRepository`, piše kroz isto.
- `src/lib/migrations/heal-card-taxonomy.ts`, `remap-from-backup.ts`: zameniti `db.cards.toArray()` sa `listAllCards()`; pisanje preko `cardMapWrites.bulkPut` (već radi pravi SQLite + RAM commit posle B1).
- `src/lib/editor-v4/lazy-migrate.ts`: card grana već prešla na `cardMapWrites` u B1. Sources/articles grane (linije 68+) prebaciti sa `db.sources.toArray()`/`db.knowledgeBaseArticles.toArray()` na `listAllSources()`/`listAllArticles()`.
- `src/lib/editor-v4/preflight-telemetry.ts`: ukloniti `useLiveQuery` (i tu poslednji `dexie-react-hooks` import) — telemetrija ide na `useQuery(queryKeys.cards.all, …, { select })` sa lightweight count selektorom.

#### Linked cards hook
- `src/hooks/source-reader/useLinkedCards.ts`: poslednji direktni `useLiveQuery` van preflight. Prebaciti na `useQuery(queryKeys.cards.bySource(sourceId))` (helper već postoji u queries/cards.ts).

#### Tests
- 10+ test fajlova mockuje `@/lib/db` ili koristi Dexie schema (npr. `zettelkasten-mutations.test`, `card-draft-autosave.test`, `category-repository.test`, …). Pre rušenja `db-schema.ts` migrirati ih na `@testing-library`-stil fixturese:
  - testovi koji čitaju iz `db.X.toArray()` → mockovati `listAll*` iz `@/lib/db/queries`.
  - testovi koji pišu kroz Dexie direktno → ili portati na `*Async` mutaciju ili spin-up SQLite WASM in-memory u `setup.ts`.

## A1c-4 — Drop Dexie schema, runner i dep

Tek kad A1c-1/2/3 prođu sve testove i 1 soak ciklus, finalni korak:

### Izmene

- `src/lib/db/index.ts` (Dexie schema barrel) i `src/lib/db-schema.ts`: obrisati. `db` import više nigde ne postoji (provera kroz `rg "from \"@/lib/db\"" -A1 | grep -v "type "` mora da bude prazan posle A1c-3).
- `src/lib/db-queries.ts` (legacy barrel) i `src/lib/db-seed.ts`: obrisati ili reducirati na SQLite-only seed (u `runSchema.ts` već stoji seed putanja kroz `categoryRepository`).
- `src/lib/persistence/sqlite/migrate-from-idb.ts`: zameniti sa `src/lib/persistence/sqlite/assertNoLegacyIdb.ts`:
  - proverava da je `_migrationComplete` flag u SQLite KV setu, ili da `indexedDB.databases()` ne prijavljuje legacy `MemorIaDB` (ili kako se zove). Ako pronađe legacy IDB **i** SQLite je prazan → emit `LEGACY_IDB_DETECTED` na boot-recovery gate (postoji ekran), upućuje korisnika na one-shot export tool.
  - Clean install (prazan IDB) → no-op.
- `src/lib/persistence/idb-adapter.ts`: obrisati (samo bulkApply ostatak).
- `src/lib/persistence/PersistAdapter.ts`: ukloniti komentare o outbox/IDB.
- `src/hooks/card-bootstrap/bootDb.ts`, `runSchema.ts`: skinuti Dexie boot grane i `db.open()` call-ove.
- `package.json`:
  ```bash
  bun remove dexie dexie-react-hooks
  ```
- ESLint: ukloniti `dexie` iz allowed imports liste (ako postoji).

### One-shot export tool

Korisnici sa legacy IDB-om koji su preskočili sve soak release verzije: `src/tools/export-legacy-idb.html` (statična HTML stranica unutar `public/`) koja Dexie-jem otvori legacy bazu i spell-uje backup.zip — ne deli kod sa main app bundle-om. Distribuira se kao zaseban Electron entry point ili download link u recovery gate-u.

## Verifikacija (gate posle A1c-4)

1. `bun run build` čista.
2. `rg -i dexie dist/` → 0 hit-ova (i source map-i, ne samo .js).
3. `bun run test` — sve zeleno.
4. E2E manuelni pas u Electron preview:
   - Hard reset (obriši OPFS + IDB), čist boot, seed kategorija.
   - CRUD ciklus za sve domene: card create/edit/delete, source upload, mindmap save, mnemonic save, zettelkasten article create + edit + delete, planner entry.
   - Backup → restore na fresh profil (overwrite + merge strategija).
   - Category delete sa N=50 cards, M=5 sources, K=3 mindMaps — proveriti FK CASCADE.
   - Planner sync nakon category reorder.
5. DevTools Network/Performance: nijedan IDB transaction nije otvoren posle boot-a (`indexedDB` panel prazan ili samo Electron internals).

## Tehnički detalji

- **Order of operations je tvrd**: A1c-0 → A1c-1 → soak → A1c-2 → A1c-3 → A1c-4. Nije moguće rušiti `db-schema.ts` (A1c-4) dok backup pipeline (A1c-3) još iterira `db.cards.toArray()`.
- Reverse-merge plan: svaki PR ima feature flag `__SQLITE_ONLY__` (default true u DEV, gradual rollout u PROD); flip nazad na `false` vraća Dexie fallback grane (do A1c-4 gde ih više nema).
- `cardMapWrites` (iz B1) i `categoryDeletionService` (iz A2) se ne diraju — već su SQLite-primary.
- Memory update na kraju: `mem://architecture/sqlite-ssot-cutover` dobija "A1c isporučen" red i status: "Dexie uklonjen, jedan SSOT".

## Net izlaz

- Bundle: `dexie` (~80 KB gzipped), `dexie-react-hooks` (~3 KB) — out.
- LOC: ~600 LOC mirror grana + 2 façade keša + Dexie schema + migrate-from-idb runner — out.
- Surface: 1 write path (SqlExecutor.transaction), 1 read path (queries/* → SQLite), 1 cache layer (TanStack QueryClient), 1 transaction model (SQLite ACID).
