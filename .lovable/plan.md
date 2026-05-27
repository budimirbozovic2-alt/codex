# Roadmap: koraci 5–10 (SQLite SSOT + TanStack cut-over)

Cilj: dovršiti tranziciju sa Dexie+Ref-Delta na **SQLite-primary + TanStack `useQuery`/`useMutation`**, kolapsirati legacy adaptere, ukloniti Dexie kao runtime zavisnost i očistiti web build.

Polazna tačka: bridges.ts pokriva sources / planner / drafts / cards / settings / mindMaps / mnemonics. Repos za sve domain tabele (cards, sources, mindMaps, drafts, knowledgeBase, mnemonics, majorSystem, mnemonicTestLog, planner snapshot) već su SQLite-primary sa Dexie mirror-om.

---

## 5. PR-7f M2 — `useQuery` roll-out (preostali hookovi)

**Scope:** Zamijeniti sve preostale `useEffect + useState + listener` čitače sa `useQuery` koristeći već postojeće bridges + queryKeys.

Migracije (svaka = 1 hook + verifikacija):

- `useMindMaps`, `useMindMapsByCategory`, `useMindMap(id)` → `useQuery({ queryKey: queryKeys.mindMaps.*, queryFn: loadMindMaps / getMindMap })`. Skinuti `loadMindMaps` interni cache (TanStack postaje cache).
- `useMnemonicCards`, `useMnemonicCardsByCategory` → `queryKeys.mnemonics.*`.
- `useKnowledgeBaseArticles` (Zettel index) → `queryKeys.knowledgeBase.all()`; treba dodati `onKnowledgeBaseChanged` emitter u `queries/knowledge-base.ts` + bridge granu.
- `useMajorSystem`, `useMnemonicTestLog` → `queryKeys.mnemonics.majorSystem/testLog*`; dodati emittere u oba repo modula i bridge grane.
- `useCategorySources` već koristi listener — prevesti na `useQuery` (`queryKeys.sources.byCategory`).
- `usePlannerData`: lokalni `config` u `useState/localStorage` → `useQuery({ queryKey: queryKeys.planner.config(), queryFn: loadPlanner })` + `setConfig` zamijeniti sa `useMutation`-om (priprema za M3).

**Verifikacija po hooku:** targeted vitest + ručno klikanje preview-a; potvrditi da invalidacija stiže iz bridges (DevTools query log).

**Izlaz:** nula `useEffect`+listener parova za read-path. Module-level cache-evi (`_cache` u sources-storage, mindmap-storage) postaju mrtvi i obrisivi u koraku 9.

---

## 6. A2 — `categoryDeletion` collapse

**Stanje:** `categoryDeletionService` radi atomski cascade preko Dexie + ručno gađa svaku tabelu, plus paralelno SQLite FK CASCADE već radi posao na SQLite strani.

**Plan:**
1. Verifikovati da `schema.sql` ima `ON DELETE CASCADE` za sve child tabele (sources, cards, mindMaps, knowledgeBaseArticles, mnemonics, drafts, plannerEntries) — dopuniti gdje fali.
2. Service skratiti na: `DELETE FROM categories WHERE id = ?` u jednoj `SqlExecutor.transaction`, zatim `notify*Changed` za sve domene (bridges rade ostalo).
3. Dexie mirror briše svoj dio kroz repo-level `delete*ByCategory` helpere (privremeno, do A1c).
4. Skinuti per-tabela ručne loop-ove i `keyedMutex` oko brisanja — SQLite ACID je dovoljan.
5. Test: `category-deletion.test.ts` — seed kategoriju sa N=children kroz repo API, obrisati, assert-ovati prazno stanje u SQLite + RAM projekcijama.

**Izlaz:** ~150 LOC manje, jedna transakcija, garantovan integritet preko FK.

---

## 7. PR-7f M3 — `useMutation` cut-over

**Scope:** Zamijeniti sve direktne `repo.commit*` + `notify*Changed` pozive sa `useMutation` (onMutate optimistic, onError rollback). Bridges nastavljaju invalidirati nakon `notify*` koji repo i dalje firea u `onSettled`.

Prioritet:

- **Cards** (najveći ROI): `useCardActions` (`saveCard`, `deleteCard`, `bulkUpsert`, `gradeSection`) — sve preko `useMutation`; ukloniti `cardCommandBus` poziv za DB pisanja (Core memorija već kaže DEPRECATED). Zadržati `keyedMutex` samo za UI flow guard-ove.
- **Sources**: `saveSource`, `deleteSource`, `linkEssay` u `useSourceActions`.
- **MindMaps**: `useMindMapActions` (save/delete/duplicate).
- **Mnemonics + MajorSystem + TestLog**: feature-level akcije.
- **Knowledge base (Zettel)**: `saveArticle`, `deleteArticle`, alias mutate.
- **Planner**: `savePlanner`, `recordDayDiscipline`, `incrementDailyMapped` — `useMutation` sa optimistic update plannera config-a.

**Konvencija:**
```ts
const mut = useMutation({
  mutationFn: (input) => repo.commit(input),
  onMutate: async (input) => { /* snapshot + cache.setQueryData */ },
  onError: (_e, _input, ctx) => { /* rollback iz ctx */ },
  onSettled: () => qc.invalidateQueries({ queryKey: [...] }),
});
```

**Verifikacija:** po-feature integ test + ručna provjera offline rollback-a (throw u repo → UI vraća prethodno stanje).

**Izlaz:** `Ref-Delta` pattern potpuno eliminisan iz pozivnih mjesta; AppContext više ne radi optimistic ref mutacije.

---

## 8. B1 — `cardRepository` collapse

**Stanje:** `cardRepository` je sloj koji još drži RAM projekciju, listenere i delta-merge logiku iz Ref-Delta ere.

**Plan:**
1. Identifikovati šta još koristi `cardRepository` (poslije M3 to je samo bootstrap reload i `categoryRecords` projection u AppContext).
2. Premjestiti `listAllCards` / `getCardsByIds` direktno u `queries/cards.ts` (već je tamo) — repo postaje pass-through.
3. `loadInitialData` poziva `listAllCards` direktno; AppContext projection (`categoryRecords`) gradi se iz QueryClient cache snapshot-a kroz selektor hook `useCategoryRecords`.
4. Obrisati `src/lib/repositories/cardRepository.ts` i njegov barrel re-export; ESLint Public API Wall verifikuje da nema visećih importova.
5. Test: `card-repository-delete` test prebaciti na repo API (`queries/cards`) ili obrisati ako je redundantan sa M3 testovima.

**Izlaz:** Jedan sloj manje, čist `UI → useQuery → queries/* → SQLite` data-flow.

---

## 9. A1c — Drop Dexie mirror + drop dexie dep

**Predu­slov:** Koraci 5–8 prošli i jedan soak release sa SQLite-primary u produkciji bez Dexie fallback hit-ova (telemetry counter na `tryGetExecutor() == null` mora biti 0 u DEV i PROD).

**Plan:**
1. U svakom `queries/*` modulu ukloniti Dexie mirror grane (`await db.X.put` poslije SQLite write) i Dexie fallback čitače. Repo postaje SQLite-only; ako executor nije dostupan, baci `assertDesktop`.
2. Obrisati `src/lib/db/index.ts` (Dexie schema), `recoverOutboxOnBoot`, `outbox` tabelu, `migrate-from-idb.ts` ostaviti samo kao no-op koji proverava da je migracija već odrađena (čita SQLite flag) — kod prvog clean install-a bez IDB-a samo skroz preskoči.
3. `package.json`: `bun remove dexie dexie-react-hooks`. Provjeriti da nigdje nije ostao `useLiveQuery` (već zabranjen Core pravilom).
4. Bridges: ukloniti SSOT façade kešove (`_cache` u `sources-storage`, `mindmap-storage`) — TanStack je jedini cache.
5. Migration runner: schema v4 ostaje, ali `migrate-from-idb` zamijeniti sa `assertNoLegacyIdb` (warn + telemetry ako neko ima staru IDB, jednokratni eksport tool ostaje za podršku).
6. Verifikacija: full E2E pas (boot, CRUD, backup, restore, category delete, planner) bez Dexie u bundle-u (`vite build` + `rg dexie dist/` → nula).

**Izlaz:** Bundle -~80 KB, jedan SSOT, jedan write path, jedan transaction model.

---

## 10. Finale — Web cleanup + memory sanitize

1. **Web build deprecation finalize:** `assertDesktop` u svim entry tačkama; `index.html` web fallback stranica sa "Download desktop" CTA umjesto app shell-a. Skinuti `vite-plugin-pwa` i sve mobile/PWA artefakte.
2. **Code dead-removal sweep:** `knip` ili `ts-prune` za pronalaženje mrtvog koda nakon koraka 5–9; obrisati. Posebno: stari `event-bus`, `BroadcastChannel` artefakti, `useLiveQuery` adapteri, neiskorišćeni `keyedMutex` instance.
3. **ESLint walls dopuniti:** zabraniti import `dexie`, `dexie-react-hooks` iz bilo gdje; zabraniti direktan `db.*` pristup (sve kroz `@/lib/db/queries`).
4. **Memory sanitize:** ažurirati Core pravila i memorije:
   - `architecture/sqlite-ssot-cutover` → "DONE, Dexie removed".
   - `architecture/storage-and-persistence-v6` → arhivirati (zamijeniti `storage-v7-sqlite-only`).
   - `architecture/idb-ssot-migration` → obrisati (više nije relevantno).
   - `technical-choices/ref-delta-persistence-v4`, `card-command-bus`, `service-layer-pattern` (Dexie mutex) → obrisati ili označiti DEPRECATED.
   - `technical-choices/dexie-query-strategy` → obrisati.
   - `architecture/tanstack-query-read-path` → unaprijediti na "TanStack je SSOT cache za read+write".
5. **Docs:** kratki `docs/architecture/data-flow.md` sa dijagramom UI → useQuery → SQLite, jedan ekran.
6. **Release notes + soak window:** dvije nedjelje produkcijskog soak-a sa telemetry watchom na FK violations, transaction failures, query cache miss rate.

---

## Tehnički detalji (suho)

- **Query invalidation granularnost:** bridges trenutno invalidiraju cijeli `["domain"]` prefix. U M3 razbiti po scope-u (`["cards","cat",id]`) tamo gdje je hot path (CategoryView re-render budget).
- **Optimistic snapshot keys:** `useMutation.onMutate` mora pozvati `qc.cancelQueries` + `qc.getQueryData` za sve overlap-ujuće ključeve; helper `snapshotAndPatch(qc, keys, patcher)` ide u `src/lib/query/optimistic.ts`.
- **Boot order:** poslije A1c, `ensureDbOpen` (SQLite) postaje sinkroni preduslov za `installQueryBridges`. `BootStateProvider` već to garantuje; samo skinuti Dexie boot granu.
- **Test strategija:** za svaki PR — jedan unit test po novom hook-u + jedan integ test koji verifikuje da bridge invalidacija stiže do `useQuery` cache-a (već postoji obrazac u `query-bridges.test.ts`).
- **Telemetry:** dodati counter `sqlite.fallback.dexie` koji se inkrementira kad god `tryGetExecutor` vrati null u repo modulima — gate za korak 9.

## Sekvenca i zavisnosti

```text
5 (M2 useQuery)  ──┐
                   ├──► 7 (M3 useMutation) ──► 8 (B1 collapse) ──► 9 (A1c drop Dexie) ──► 10 (finale)
6 (A2 cascade)   ──┘
```

Koraci 5 i 6 se mogu raditi paralelno. 7 zahtijeva 5. 8 zahtijeva 7. 9 zahtijeva 7+8 i jedan soak window. 10 zatvara.
