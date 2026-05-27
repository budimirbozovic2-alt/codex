# Sesija 2 — S3: Read-path migracija (planner + drafts) iz Dexie u SQLite + TanStack

Cilj: ukloniti Dexie sa hot read-patha za sve preostale tabele koje učestvuju u UI render ciklusu, kako bi se otključali A1 (drop IDB outbox), A2 (collapse `categoryDeletionService`) i B1 (drop `dexie` dep).

## Skopiranje (po nalazu eksploracije)

| Domain | Trenutni read | Status |
|---|---|---|
| **Planner** | `db.settings(plannerConfig, dailyMapped, lastRedistribute)` + `db.disciplineLog` | **Migrira** |
| **Drafts** | `db.drafts` (key, source, updatedAt) | **Migrira** |
| **Examiner profile** | `categoryRecords` (RAM projection iz `categories.payload`) | **Već SQLite-backed**, izvan obima |
| **App/Subject settings** | `db.settings(appSettings, subjectSettings:*, srSettings, appEntry, sr-last-backup)` | **Migrira** (isti KV mehanizam kao planner) |
| **Metacognitive (appEntry)** | `db.settings(appEntry, lastAnalysisDate)` | Migrira sa settings |

`db.activityLog` / `db.pomodoroLog` / `db.knowledgeBaseArticles` ostaju izvan obima (nisu na hot read-pathu, koriste se samo u emergency-export i health monitor count-u — A1/B1 ih briše nakon zasebnog soak-a).

## Faze

### Faza 1 — Schema + codecs (PR-9 M1)

`src/lib/persistence/sqlite/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS disciplineLog (
  date     TEXT PRIMARY KEY,    -- YYYY-MM-DD
  payload  TEXT NOT NULL        -- DisciplineEntry JSON
);
CREATE INDEX IF NOT EXISTS idx_discipline_date ON disciplineLog(date);

CREATE TABLE IF NOT EXISTS drafts (
  key        TEXT PRIMARY KEY,
  source     TEXT NOT NULL,     -- "zettelkasten-article" | "source-html" | "card-form" | …
  updatedAt  INTEGER NOT NULL,
  payload    TEXT NOT NULL      -- DraftRecord JSON
);
CREATE INDEX IF NOT EXISTS idx_drafts_source     ON drafts(source);
CREATE INDEX IF NOT EXISTS idx_drafts_updatedAt  ON drafts(updatedAt);
```

KV (`kv`) tabela već postoji — `plannerConfig`, `dailyMapped`, `lastRedistribute`, `appSettings`, `subjectSettings:<uuid>`, `srSettings`, `appEntry`, `lastAnalysisDate`, `sr-last-backup` idu kao JSON-stringovi pod istim ključevima.

Codecs (`row-codecs.ts`): dodaj `encodeDraft / decodeDraft`, `encodeDiscipline / decodeDiscipline`. KV value je `JSON.stringify(value)` — jedna utility funkcija `kvGet<T>(key)` / `kvPut<T>(key, value)` u `executor` wrapperu.

### Faza 2 — Migration runner (PR-9 M2)

`src/lib/persistence/sqlite/migrate-from-idb.ts`: dodaj korake koji čitaju iz Dexie i upisuju u nove SQLite tabele unutar jedne `SqlExecutor.transaction`:

```text
migrate-from-idb.ts
├─ migrateSettings(idb → sqlite.kv)      // svi ključevi pod whitelistom
├─ migrateDisciplineLog(idb → sqlite.disciplineLog)
└─ migrateDrafts(idb → sqlite.drafts)
```

Migracija je idempotentna: čeka da postojeći PR-8 koraci završe, pa overwriteuje SQLite snapshot ako je `kv("migration-flag-v9")` < target verzije. Stari Dexie redovi ostaju netaknuti do A1 (PR-10).

### Faza 3 — Repository sloj

Novi moduli koji izoluju SQL od potrošača:

```text
src/lib/db/queries/
├─ planner.ts        // loadPlanner(), saveDiscipline(), kvGet/kvPut
├─ drafts.ts         // putDraft, getDraft, listDraftsBySource, deleteDraft
└─ settings.ts       // appSettings + subjectSettings + srSettings
```

Svaki potpis ostaje isti kao trenutni Dexie helper (drop-in zamjena) — tako da call-site refactor bude trivijalan.

### Faza 4 — Cut-over potrošača

Sve sljedeće datoteke prebacuju import sa `@/lib/db` na novi repository:

- `src/lib/planner/cache.ts` (initPlannerCache) → `@/lib/db/queries/planner`
- `src/lib/planner/config.ts`, `daily-mapped.ts`, `discipline.ts` → isti repo (writes preko `SqlExecutor.transaction`, `enqueueWrite` mutex se ukida — SQLite ACID je SSOT, vidi `mem://architecture/sqlite-ssot-cutover`)
- `src/lib/drafts/draftsTable.ts`, `draftRecovery.ts` → `@/lib/db/queries/drafts`
- `src/lib/app-settings.ts`, `src/lib/subject-settings.ts`, `src/lib/metacognitive-storage.ts` → `@/lib/db/queries/settings`
- `src/lib/electron-integration.ts` (export bundle) → repo getteri umjesto direktnog `db.settings.get`
- `src/lib/category-deletion-service.ts:71,114-145` ostaje na Dexie privremeno (A2 ga collapsuje u jednu SQL DELETE u sljedećoj sesiji)

### Faza 5 — TanStack bridge (PR-7f M2)

`onPlannerChanged` u `planner/cache.ts` već postoji i emituje 4 kind-a. Dodaj:

- `onDraftsChanged()` emitter u `drafts/draftsTable.ts` (puzano na svaki `put`/`delete`)
- U `src/lib/query/bridges.ts` (postojeći fajl ako ima, ili novi) registruj invalidate handler-e:
  ```ts
  onPlannerChanged(kind => qc.invalidateQueries({ queryKey: ["planner", kind] }));
  onDraftsChanged(()  => qc.invalidateQueries({ queryKey: ["drafts"] }));
  ```
- `useQuery` hookovi: `usePlannerConfig`, `useDisciplineLog`, `useDraftBySource(source)` — svi sa `staleTime: Infinity` jer su RAM cache + manual invalidacija.

### Faza 6 — Verifikacija + memory update

1. `rg -n "db\.(settings|disciplineLog|drafts)" src/ | grep -v persistence` mora vratiti samo `category-deletion-service.ts` (A2 target) i `emergency-export.ts` / `healthService.ts` (read-only count, izvan hot patha).
2. Pokrenuti postojeće vitest setove (`migration-runner`, `planner-cache`, `draftRecovery`) — svi prolaze.
3. Boot smoke: `initPlannerCache` izvršava se < 50 ms, `recoverDraftsOnBoot` ne baca toast za migrirane drafts.
4. Ažurirati `mem://architecture/sqlite-ssot-cutover` napomenu: planner + drafts + KV settings sad SQLite-primary; jedini preostali Dexie reader je `category-deletion-service` (čeka A2) i `emergency-export` + audit count-eri (čekaju A1/B1).

## Procjena LOC delta

- `+` ~250 LOC: schema rows, codecs, 3 nova repo modula, 2 nova `useQuery` hook-a.
- `−` ~150 LOC: direktni Dexie pozivi iz 8 fajlova, `enqueueWrite` mutex i `createKeyedMutex` poziv u planner-u (SQLite ACID zamjenjuje).

Neto: ~+100 LOC u ovoj sesiji, ali otključava ~-1500 LOC u A1 (drop IDB outbox + Dexie v23 mirror) i ~-250 u A2.

## Ne-ciljevi (explicit out of scope)

- `db.cards` / `db.sources` / `db.mindMaps` / `db.categories` / `db.mnemonics` — već SQLite-primary kroz PR-8.
- `db.activityLog`, `db.pomodoroLog`, `db.knowledgeBaseArticles` — A1 ih briše bez migracije (nepotrebni).
- Drop `dexie` dependency — B1, čeka da `category-deletion-service` i emergency-export migriraju.
- Backup/restore format — `backup-schema.ts` već prepoznaje sve KV ključeve; codec ostaje JSON-kompatibilan.

## Rizici

- **Migracija starih korisnika**: prvi boot nakon PR-9 mora pročitati IDB jednom; ako Dexie open fail-uje (npr. browser blocking IDB), planner pada na default. Mitigacija: try/catch oko `migrateSettings/Drafts/Discipline` sa `logger.warn` + nastavak boot-a sa praznim KV.
- **Race između starih write-ova u Dexie i novih u SQLite**: tokom soak-a A1 oba kanala su živa za read-only fallback. Ovdje ne zapisujemo više u Dexie za planner/drafts/settings — kompletan cut-over.
- **Test coverage**: `vitest` setup za SQLite koristi `better-sqlite3` shim — postojeći `executor.test.ts` pattern mora se proširiti za `disciplineLog` i `drafts` tabele.

## Akcioni redoslijed (jedan PR, tri commit-a)

1. **Commit A (schema + codecs + migracija)**: Faza 1 + 2, testovi za codec i migration-runner step.
2. **Commit B (repo + cut-over)**: Faza 3 + 4. Build mora proći, svi vitest setovi green.
3. **Commit C (TanStack bridge + memory update)**: Faza 5 + 6.

Reci da li želiš da krenem direktno sa Commit A, ili prvo da provjerim neke specifične detalje (npr. tačan oblik `kv` payload-a za `subjectSettings:*` ključeve sa prefiksom).
