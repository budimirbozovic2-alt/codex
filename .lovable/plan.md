# Sesija 2 finale (Commit B + C) + A2 collapse

Tri commit-a, ista grana, atomski mergeano. Završava SQLite read-path migraciju za planner/drafts/settings i kolapsira `category-deletion-service` na native FK CASCADE. **A1+B1 ostaju za kasnije** kad svi domeni (cards/sources/mindMaps/zettelkasten/mnemonics) budu SQLite-primary.

---

## Commit B — Cut-over planner / drafts / settings na novi repo

**Cilj**: izbaciti direktne Dexie pozive iz hot read-patha za 3 domena. Repository sloj već postoji (`src/lib/db/queries/planner.ts`); treba dodati `drafts.ts` + `settings.ts` i preusmjeriti potrošače.

### B.1 — Drafts repo

```text
NEW  src/lib/db/queries/drafts.ts
       - getDraft(key)              → SQLite primary, Dexie fallback (dev)
       - putDraft(record)           → SQLite write, Dexie mirror
       - listDraftsBySource(srcId)  → SELECT * FROM drafts WHERE source=?
       - deleteDraft(key)
       - onDraftsChanged() emitter  (module-level Set<() => void>)
       - svaki write zove _notify() poslije commita
```

Pattern 1:1 sa postojećim `planner.ts`: `tryGetExecutor()` → SQLite ili Dexie fallback; mirror write u Dexie kao soak insurance.

### B.2 — Settings repo

```text
NEW  src/lib/db/queries/settings.ts
       - getSetting<T>(key)          → kvGet<T>(exec, key) ili db.settings.get
       - putSetting<T>(key, value)   → kvPut + Dexie mirror
       - listSettingsByPrefix(pfx)   → SELECT key,payload FROM kv WHERE key LIKE 'pfx%'
       - deleteSetting(key)
       - onSettingsChanged(prefix?)  emitter (filtri po prefiksu)
```

Pokriva `appSettings`, `subjectSettings:*`, `metacognitive:*`.

### B.3 — Cut-over potrošača

```text
EDIT src/lib/planner/cache.ts
       - initPlannerCache() → loadPlannerSnapshot() iz @/lib/db/queries/planner
       - enqueueWrite / createKeyedMutex → DROP (SQLite ACID je SSOT)
       - sve writes idu kroz planner repo (savePlannerConfig, saveDailyMapped,
         saveLastRedistribute, saveDisciplineLog)
       - sync ref-mutacije + _notify() ostaju (RAM cache + emit)

EDIT src/lib/planner/config.ts
       - savePlanner(): plannerCache.set(cfg) + savePlannerConfig(cfg) (await? — NE, fire-and-forget)

EDIT src/lib/planner/daily-mapped.ts
       - incrementDailyMapped + autoRedistributeIfNeeded:
         dailyMappedCache.set + saveDailyMapped() / saveLastRedistribute()
       - drop enqueueWrite imports

EDIT src/lib/planner/discipline.ts
       - saveDisciplineLog(): disciplineCache.set + savePlannerDisciplineLog
       - drop enqueueWrite

EDIT src/lib/drafts/draftsTable.ts
       - svi db.drafts.* pozivi → @/lib/db/queries/drafts (put/get/list/delete)

EDIT src/lib/drafts/draftRecovery.ts
       - recoverDraftsOnBoot() → listDraftsBySource ili full scan helper

EDIT src/lib/app-settings.ts
       - get/save → @/lib/db/queries/settings

EDIT src/lib/subject-settings.ts
       - get/save/clear → @/lib/db/queries/settings (key prefix subject_settings:)

EDIT src/lib/metacognitive-storage.ts
       - reads/writes → @/lib/db/queries/settings (key prefix metacognitive:)
```

**Što NE diramo** (intentno ostaje na Dexie):
- `src/lib/sources-storage.ts`, `mindmap-storage.ts`, `zettelkasten-storage.ts`, `cardRepository.ts`, mnemonic cards — ovi domeni nisu u opsegu Sesije 2.
- `category-deletion-service.ts` — to je Commit D target.
- `emergency-export.ts`, `db-seed.ts`, backup migrations, healers, normalizeCategories — read-only audit path, ne diraju hot path.

### B.4 — Verifikacija

```text
rg -n "db\.settings\.(get|put|delete)" src/lib/planner src/lib/drafts \
   src/lib/app-settings.ts src/lib/subject-settings.ts \
   src/lib/metacognitive-storage.ts
→ MORA biti prazno (osim Dexie mirror grane u repository fajlovima)

rg -n "enqueueWrite|createKeyedMutex" src/lib/planner
→ MORA biti prazno

postojeći vitest setovi (planner-cache, draftRecovery, migration-runner)
→ all green
```

---

## Commit C — TanStack bridge + memory update

### C.1 — Bridge wiring

```text
EDIT src/lib/query/bridges.ts
       - dodaj: onDraftsChanged(() => qc.invalidateQueries({ queryKey: ["drafts"] }))
       - opcionalno: onSettingsChanged(prefix => invalidate ["settings", prefix])

NEW  hooks (PR-7f M2):
       - src/hooks/queries/usePlannerConfig.ts
         useQuery({ queryKey: ["planner","config"], queryFn: loadPlanner, staleTime: Infinity })
       - src/hooks/queries/useDisciplineLog.ts
       - src/hooks/queries/useDraftBySource.ts
```

`staleTime: Infinity` jer RAM cache + emit-driven invalidacija pokriva sve mutacije.

### C.2 — Memory updates

```text
UPDATE mem://architecture/sqlite-ssot-cutover
  - planner / drafts / KV settings sad SQLite-primary
  - preostali Dexie hot readers: sources/mindMaps/zettelkasten/cards/mnemonics
    + category-deletion-service (collapse u Commit D)
  - emergency-export, db-seed, backup migrations ostaju Dexie (audit/seed path)
  - dexie dep drop blokiran A1 (svi domeni) + B1 (zadnji import)

UPDATE mem://architecture/planner-decomposition
  - enqueueWrite + createKeyedMutex uklonjeni iz planner-a; SQLite ACID je SSOT

UPDATE Core u mem://index.md ako spominje planner-storage write mutex
  (Data Integrity v4 napomena se ažurira u Commit D)
```

### C.3 — Verifikacija

```text
boot smoke: initPlannerCache < 50ms, planner config restore identičan
SmartPlanner UI renderuje bez network/console errors
drafts auto-recovery banner radi za novi draft (write u SQLite, restore na refresh)
```

---

## Commit D — A2: categoryDeletionService kolaps

**Trenutno**: `cascadeDeleteCategoryDomains` (161 LOC) ručno briše po 6 tabela u jednoj Dexie `rw` transakciji.

**Cilj**: FK CASCADE već postoji u `schema.sql` za cards/sources/mindMaps/articles (sve sa `categoryId`). Jedna `DELETE FROM categories WHERE id = ?` u `SqlExecutor.transaction` kaskadira sve. Ostaje samo:
- Re-parent mod (`opts.purgeCards === false`): cards/sources se prebacuju na `fallbackId` — to je UPDATE, ne DELETE.
- Mnemonics: provjeriti da li ima FK na categories u schema.sql; ako nema, dodati CASCADE u migration (schema bump).
- KV scrub: `subject_settings:<id>` + planner config grane (subjectOrder/hardSubjects/phases.categories) — zadržati explicit cleanup (KV nema FK).

### D.1 — Schema audit

```text
CHECK src/lib/persistence/sqlite/schema.sql
  - cards.categoryId         FK CASCADE ✓
  - sources.categoryId       FK SET NULL (postojeće) — provjeriti da li ovo
                              odgovara purgeCards=true semantici; možda treba
                              parametrizovati ili dodati posebnu rutu
  - mindMaps.categoryId      FK CASCADE ✓
  - knowledgeBaseArticles    provjeriti subjectId FK
  - mnemonics                provjeriti categoryId FK; ako fali → schema bump
                              + migration v3 (ALTER nije dovoljan; rebuild ili
                              dodatni explicit DELETE)
```

Ako bilo koja od ovih FK fali, prvo dopuni schema (migration v3 u `migration-runner.ts`), tek onda kolaps.

### D.2 — Kolaps service-a

```text
EDIT src/lib/category-deletion-service.ts (161 → ~50 LOC)

export async function cascadeDeleteCategoryDomains(
  categoryId: string,
  opts: { purgeCards: boolean; fallbackId: string }
): Promise<CascadeResult> {
  const exec = await getOpfsSqliteExecutor();
  const counts = await exec.transaction(async (tx) => {
    let cardsAffected = 0, sourcesAffected = 0;

    if (!opts.purgeCards && opts.fallbackId) {
      // Re-parent prije DELETE da CASCADE ne pojede
      cardsAffected = await tx.run(
        "UPDATE cards SET categoryId=?, subcategoryId=NULL, chapterId=NULL, updatedAt=? WHERE categoryId=?",
        [opts.fallbackId, Date.now(), categoryId]
      );
      sourcesAffected = await tx.run(
        "UPDATE sources SET categoryId=? WHERE categoryId=?",
        [opts.fallbackId, categoryId]
      );
    }

    // Count siblings prije DELETE (FK CASCADE briše bez count-a)
    const [articles, mindMaps, mnemonics] = await Promise.all([
      tx.get<{c:number}>("SELECT COUNT(*) c FROM knowledgeBaseArticles WHERE subjectId=?", [categoryId]),
      tx.get<{c:number}>("SELECT COUNT(*) c FROM mindMaps WHERE categoryId=?", [categoryId]),
      tx.get<{c:number}>("SELECT COUNT(*) c FROM mnemonics WHERE categoryId=?", [categoryId]),
    ]);

    // KV scrub (nema FK)
    const settingsKey = `subject_settings:${categoryId}`;
    const hadSettings = await tx.get("SELECT key FROM kv WHERE key=?", [settingsKey]);
    if (hadSettings) await tx.run("DELETE FROM kv WHERE key=?", [settingsKey]);

    let plannerScrubbed = false;
    const plannerRow = await tx.get<{payload:string}>("SELECT payload FROM kv WHERE key='plannerConfig'");
    if (plannerRow) {
      const cfg = JSON.parse(plannerRow.payload) as PlannerConfigShape;
      // dirty-check + scrub (isto kao prije, samo kroz tx.run)
      ...
    }

    // ATOMIC CASCADE
    if (opts.purgeCards) {
      await tx.run("DELETE FROM categories WHERE id=?", [categoryId]);
    } else {
      // U re-parent modu cards/sources su već premješteni; samo brišemo aggregate
      await tx.run("DELETE FROM categories WHERE id=?", [categoryId]);
    }

    return { articles: articles?.c ?? 0, mindMaps: mindMaps?.c ?? 0,
             mnemonics: mnemonics?.c ?? 0, settings: hadSettings ? 1 : 0,
             plannerScrubbed, cardsAffected, sourcesAffected };
  });

  // Post-commit cache invalidations (identično postojećem)
  if (counts.mindMaps > 0) invalidateMindMapsCache();
  if (counts.settings > 0) clearSubjectSettings(categoryId);
  invalidateExaminerProfile(categoryId);
  backlinkIndex.clear(categoryId);
  invalidateSourcesCache();

  return counts;
}
```

### D.3 — Mirror cleanup

Dexie mirror writes u planner/drafts/settings repository fajlovima ostaju za soak. **Ne diramo ih u Commit D** — to je A1 territory.

`db.transaction("rw", [db.cards, db.sources, ...])` poziv iz starog servisa nestaje. Dexie tabele cards/sources/mindMaps i dalje imaju stara data, ali pošto `useCategoryManagement` orchestrator čita iz RAM SSOT-a (`categoryRecords`) + repository sloja (koji su SQLite-primary za cards/sources nakon PR-8), Dexie ostaje samo soak mirror.

### D.4 — Verifikacija

```text
1. DELETE smoke: kreiraj kategoriju s 2 karticom, 1 mindMap, 1 article;
   delete → potvrdi: SELECT COUNT(*) WHERE categoryId=? za sve tabele = 0
2. Re-parent smoke: purgeCards=false, fallbackId=other
   → cards/sources prebačeni, articles/mindMaps/mnemonics obrisani
3. Postojeći `category-deletion` testovi (ako postoje) re-target na exec-based path
4. mem://features/data-integrity-v4 update: "atomic mutex hack" zamijenjen
   native SQLite tx; FK CASCADE je SSOT za cascade semantiku
```

---

## Plan izvršenja

```text
Commit B  →  cut-over (planner/drafts/settings) + build + vitest green
            smoke: SmartPlanner, draft autosave, app settings UI

Commit C  →  bridge + TanStack hooks + memory update
            smoke: useQuery-based widgets refresh nakon mutate

Commit D  →  schema audit (mnemonics FK) → optional schema v3 →
            cascadeDeleteCategoryDomains rewrite + memory update
            smoke: delete s purgeCards toggle (oba moda)
```

## Net delta

- Commit B: +120 LOC (drafts.ts + settings.ts repos), −180 LOC (enqueueWrite, mutex, direktni db.settings pozivi). **Neto ~−60 LOC.**
- Commit C: +60 LOC (3 hooks + bridge dodatci). **Neto +60 LOC.**
- Commit D: −110 LOC (categoryDeletionService kolaps). **Neto ~−110 LOC.**
- **Ukupno: ~−110 LOC**, eliminisan `createKeyedMutex` u planner-u, eliminisan ručni cascade hack, otključan A1 (drop outbox) kad se ostali domeni migriraju.

## Rizici i mitigacije

- **Mnemonics FK fali u schema.sql** — provjera u Commit D step 1; ako fali, schema bump v3 + migration step (drop+recreate ili UPDATE migration s explicit DELETE u tx-u).
- **Sources FK = SET NULL** umjesto CASCADE — to je legacy semantika (sources mogu biti unlinked). Provjeriti da li `purgeCards=true` zaista treba pobrisati sources, ili samo unlink. Ako su zaista za delete, dodati explicit `DELETE FROM sources WHERE categoryId=?` PRIJE DELETE categories.
- **Re-parent UPDATE prije DELETE** — bitan redoslijed da FK ne kaskadira. Test pokriva oba moda.
- **TanStack `useDraftBySource` nije obavezan u Commit C** — ako consumer-side refactor preliva opseg, ostaviti za poslije; bridge invalidate je dovoljan da `useQuery` userii dobiju fresh data.
