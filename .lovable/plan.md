## A1c finiš — preostalih 6 faza (Opcija A, prihvaćena)

Već gotovo: queries/* su SQLite-only (samo type imports), façade kešovi uklonjeni, `db-queries`/log-retention/metacognitive prebačeni, outbox dropan u Dexie v23.

### Faza 1 — Posljednji runtime Dexie pozivi

- `src/lib/db/queries/logs.ts`: dodati `addPomodoroLogEntry` + `loadPomodoroLogSince` + `countPomodoroLogByType` (SQL `json_extract` za `type='focus'`).
- `src/lib/db/queries/index.ts`: eksport novih helpera.
- `src/lib/storage.ts`: prepisati `addPomodoroEntry` i `getPomodoroStats` da idu kroz nove repo helpere; ukloniti `await import("@/lib/db")`.
- `db-seed.ts` već SQLite-only, ostaje.

### Faza 2 — Razdvojiti `db-schema.ts`

- Novi `src/lib/db-error.ts` (Dexie-free): `setDbEventEmitter`, `setDbErrorState`, `getDbErrorState`, `DbErrorState`, `startUnblockWatch`, `__teardownDbWatchdog`.
- Codemod 21 fajla: `import type { ... } from "@/lib/db-schema"` → `"@/lib/db-types"`.
- Update runtime callera (DbErrorProvider, main, testovi) na `@/lib/db-error`.
- `db-schema.ts` ostaje samo `MemoriaDB` + verzije + `db` instance.

### Faza 3 — Dexie pod `legacy/`

- Premjestiti `db-schema.ts` → `src/lib/legacy/idb-dexie.ts` (uz `ensureDbOpen`/`migrateFromLocalStorage` koji su trenutno u `db-seed`/posredno).
- `src/lib/db.ts`: ukloniti `export * from "./db-schema"`; ostaje samo re-export `./db-seed` (ili obrisati u potpunosti i ažurirati 4 callera).
- ESLint `no-restricted-imports`: dozvoliti `@/lib/legacy/idb-dexie` samo iz `migrate-from-idb.ts` i (privremeno) zettelkasten testova.

### Faza 4 — `bootDb` flag-gated lazy load

```text
bootDb()
  exec = await getOpfsSqliteExecutor()
  migrated = (await kvGet(exec, "migrated-from-idb-v1")) === true
  if migrated: SCHEMA_DONE bez Dexie load-a
  else:
    legacy = await import("@/lib/legacy/idb-dexie")
    await legacy.ensureDbOpen(6000)
    await migrateFromIdb(exec)
    await legacy.closeDb()
```

- `runSchema`: ukloniti `migrateFromLocalStorage` iz hot path-a (samo legacy).
- `assertNoLegacyIdb()` telemetry: ako flag postoji ali `MemoriaDB` IDB i dalje vidljiva → log "legacy-idb-residual".

### Faza 5 — Test migracija + harness gap

- 6 zettelkasten testova (`zettelkasten-{wiki-link-integration,mutations,index-article,bulk-create,article-draft,article-draft-navigation}.test.ts`) → `*KnowledgeBaseArticle*` repo API + `seedTestSqliteTable`.
- `test/sqlite-harness.ts`: dodati SELECT pattern za `findArticleByTitle` (`WHERE subjectId=? AND TRIM(title)=? COLLATE NOCASE`).
- `cards-query-bench.test.ts`: ispraviti seed (vraća 0 redova) ili olabaviti `> 0` assert.
- `migrate-from-idb.test.ts` ostaje uz `fake-indexeddb` dev dep.

### Faza 6 — Drop dependency

- `bun remove dexie-react-hooks` (verifikovano: `rg useLiveQuery src` = 0).
- `dexie` ostaje regular dependency (lazy-loadan iz `legacy/idb-dexie`); production glavni bundle ga ne uvlači jer chunk je gated migracionim flag-om.
- Verifikacija: `bun run build` + `rg -l "dexie" dist/assets/index*.js` = 0; lazy chunk `legacy-*.js` smije imati dexie.
- Bundle delta ~−60 KB main, −12 KB react-hooks dropan kompletno.

### Faza 7 — Verifikacija + memory

- `bunx tsc --noEmit` = 0, `bunx vitest run` = svih 589 pass (uključujući postojećih 8 F6.3-nasljednih fail-ova).
- `bun run build` + bundle audit.
- Update memory: `mem://architecture/sqlite-ssot-cutover` označiti A1c done; obrisati `idb-ssot-migration` / `dexie-query-strategy`; ažurirati `storage-and-persistence-v6`; Core dodati "Dexie samo lazy iza migracionog flag-a".

Implementacija ide sekvencijalno; nakon svake faze `tsc --noEmit` + relevantni testovi.
