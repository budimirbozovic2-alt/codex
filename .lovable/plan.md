# Phase 3 — Preostali audit (S2, S3, S4, S5, S7, S8, S9, S10, S11)

Devet stavki podijeljenih u 3 grupe po prirodi posla. Cilj: ukloniti mrtvi kod, smanjiti read amplification i očistiti modularne granice. Nema novih feature-a, sve su čisto interne izmjene.

---

## Grupa A — Read-path optimizacije (S2, S3, S9)

### S2 🔴 — `useKnowledgeBaseArticles` reloads ALL articles per subject view
**Problem:** `useKnowledgeBaseArticlesBySubject` poziva `loadArticlesBySubject(subjectId)` koji vraća `payload` JSON za sve članke subjekta (često 100+ rows), čak i kad UI treba samo listu naslova/index meta-podatke za sidebar.

**Plan:**
1. Dodati `listArticleHeadersBySubject(subjectId)` u `src/lib/db/queries/knowledge-base.ts` koji vraća samo `{id, subjectId, title, updatedAt, isIndex}` (bez `payload`) — koristi nove kolone iz schema umjesto `JSON.parse`.
2. Novi hook `useKnowledgeBaseHeadersBySubject(subjectId)` u `useKnowledgeBaseArticles.ts`. Ostavlja postojeći `useKnowledgeBaseArticlesBySubject` za rijetke slučajeve kojima zaista treba pun payload (npr. backlink rebuild).
3. Migrirati liste/sidebare na headers hook (audit konzumenata — `ZettelkastenSidebar`, eventualno `ArticleListPanel`).

### S3 🔴 — `countSources` / `countMindMaps` fetch full rows
**Problem:** `src/lib/db/queries/backup-readers.ts` linija 82-83: `(await listAllSources()).length` dekodira sve JSON payloade samo da dobije broj.

**Plan:**
1. Dodati `countAllSources()` u `src/lib/db/queries/sources.ts` i `countAllMindMaps()` u `mind-maps.ts` koji rade `SELECT COUNT(*)`.
2. U `backup-readers.ts` zamijeniti dvije problematične linije sa novim count funkcijama (analogno postojećem `countAllCards`).
3. Healthservice nastavlja koristiti iste imenovane exporte — zero diff za pozivaoca.

### S9 🟡 — KB `isIndex` kolona postoji ali se nikad ne queryja
**Problem:** Schema ima `idx_kb_subject_isIndex`, ali sve KB lookup operacije rade `JSON.parse(payload)` + JS filter umjesto da koriste indexed kolonu.

**Plan:**
1. Dodati `getIndexArticle(subjectId)` koji vraća payload za red gdje je `isIndex = 1` (1 row, jedan indexed seek).
2. Refaktorisati `ensureIndexArticle` u `zettelkasten-storage.ts` da prvo proba `getIndexArticle` umjesto skeniranja `loadArticlesBySubject + .find(a => a.isIndex)`.
3. Headers query (S2) već vraća `isIndex`, pa konzumenti koji žele "ima li index?" prelaze na headers.

---

## Grupa B — Mutation/write korektnost (S4, S7, S10)

### S4 🔴 — `cards.ts` decoder swallows `CardDecodeError`
**Problem:** `decodeRows`/`getCardsByIds` u `src/lib/db/queries/cards.ts` (linije 44-78) hvataju `CardDecodeError` i samo logiraju warning + skip-uju red. Korumpirana kartica tiho nestaje iz UI bez ikakvog korisničkog signala.

**Plan:**
1. Sakupljati skip-ovane id-jeve u `decodeRows`; ako lista nije prazna, emitovati `notifyCorruptCards(ids)` event (novi mali emitter u `cards.ts`).
2. Wire-ovati listener u `useHealthMonitor` koji povećava brojač "corruptCards" i prikazuje warning chip u Health UI. Nema toast spama — tihi indikator + zapis.
3. Health snapshot dobija novo polje `corruptCardIds: string[]` (capped na 50) za debugging.

### S7 🟡 — `useCardMutations` `snapshot()` ne hvata scoped queries
**Problem:** `snapshot()` čita samo `['cards','all']`. Sve scoped queryje (`['cards','cat',id]`, `byChapter`, `bySource`, `byId`) `rollback()` ne vraća — TanStack ih `cancelQueries` zaustavi, ali nakon greške ostaju stale dok bridges ne tickne novi `notifyCardsChanged` (koji se ne emituje na rollback).

**Plan:**
1. `snapshot()` proširiti: pored `all`, čitati sve aktivne queryje pod `queryKeys.cards.root` preko `qc.getQueriesData({queryKey: queryKeys.cards.root})` i sačuvati niz `[key, data]` parova.
2. `rollback()` iterira kroz snapshot i radi `qc.setQueryData(key, data)` za svaki sačuvan key. Postojeći Zustand sync poziv ostaje.
3. Tip `RollbackCtx` postaje `{ entries: Array<[QueryKey, unknown]> }`.

### S10 🟡 — Bulk writes su per-row `tx.run` (worker chatter)
**Problem:** `bulkPutArticles` u `knowledge-base.ts` (i analogno u još par repozitorijuma) radi `for (a of articles) { await tx.run(INSERT_SQL, bindRow(a)) }` — N round-tripova worker boundary za N redova.

**Plan:**
1. Audit-bulk-write helper: `tx.runMany(sql, paramsBatches)` u `SqlExecutor` interfejsu, koji u workeru priprema 1 prepared statement i izvršava ga u petlji bez extra postMessage round-tripova.
2. Implementacija u `opfs-sqlite-worker.ts` (`stmt.bind/step/reset` u JS petlji).
3. Migrirati `bulkPutArticles`, `bulkPutCards` (ako postoji per-row), `bulkUpsertMindMaps`, `bulkUpsertSources` na novi helper. Mjeriti: očekivani win ~5-10ms za 100 redova.

---

## Grupa C — Mrtvi kod / modularne granice (S5, S8, S11)

### S5 🟡 — Planner query keys hashed-into-key → cache bloat
**Problem:** Keys u `queryKeys.planner.*` (linije 37-53 u `query/keys.ts`) imaju hash inpute baked-in (`reviewLogHash`, `cardsHash`, `categoryHash`, `configHash`). Svaka promjena bilo kog inputa kreira novi entry u cache-u; stari ostaju zauvijek dok ne GC-uje TanStack (zadano 5min `gcTime`, ali sa Infinity stale-time mogu se gomilati).

**Plan:**
1. Refaktorisati `queryKeys.planner.*` da hash-ovi izađu iz `queryKey` u `queryFn` closure-e. Key postaje stabilan: `['planner','plans']`, `['planner','suggestion']`, itd.
2. Hash-evi se prosljeđuju kao `useQuery` `meta` ili kao dio closure-a u `queryFn` — refetch trigger postaje eksplicitni `invalidateQueries` iz `bridges.ts` (`planner` change emit već postoji).
3. Tweak `bridges.ts` da `kind: "config"` invalidira potrebne planner prefixe (već radi, samo se mijenja granularity).

### S8 🟡 — Drafts + settings bridge listeneri mrtvi
**Problem:** `bridges.ts` poziva `onDraftsChanged`/`onSettingsChanged`, ali u cijelom kodu nijednom se ne zove `notifyDraftsChanged`/`notifySettingsChanged`. Listeneri se nikad ne triggeraju → invalidacija drafts/settings queryja se ne dešava.

**Plan:**
1. U `src/lib/db/queries/drafts.ts` i `settings.ts` dodati pozive `notifyDraftsChanged()` / `notifySettingsChanged(key)` u svaku write putanju (`putDraft`, `deleteDraft`, `putSetting`, `deleteSetting`).
2. Verifikovati da nema dvostrukog emisija (npr. iz zustand-a).
3. Test: simulirati `putSetting('sr-subject-settings-X', …)` i provjeriti da `['subject-settings']` query observere prima invalidaciju.

### S11 🟡 — `category-deletion-service` planner scrub pripada planner modulu
**Problem:** `src/lib/category-deletion-service.ts` linije 86-110 manipulišu `plannerConfig` shape-om direktno (zna za `subjectOrder`, `hardSubjects`, `phases`). To je cross-modul coupling.

**Plan:**
1. Premjestiti scrub logiku u `src/lib/planner/planner-storage` (npr. `scrubCategoryFromPlannerConfig(categoryId): Promise<boolean>`).
2. `category-deletion-service` poziva samo `scrubCategoryFromPlannerConfig(categoryId)` i postavlja `result.plannerScrubbed = await ...`.
3. Test ostaje funkcionalno isti; planner zna svoj shape, deletion service zna samo kontrakt.

---

## Tehnički detalji

**Redoslijed implementacije (jedan PR sekvencijalno):**
1. S8 (najmanji, čisti mrtvi kod — quick win)
2. S3 + S2 + S9 (KB/counts read-path zajedno, dijele knowledge-base.ts izmjene)
3. S11 (premjesti planner scrub)
4. S5 (planner keys — zahtijeva pažljiv test)
5. S7 (mutations snapshot)
6. S10 (`runMany` helper — najveći worker izmjene)
7. S4 (corrupt cards emitter + Health UI)

**Testovi:** Svaka stavka dobija/nadograđuje unit test. Health Monitor i Planner imaju postojeće suite-ove koji moraju ostati zeleni. Cilj: zadržati baseline 590/591 passing.

**Memory ažuriranja:**
- `mem://architecture/tanstack-query-read-path` — dodati Phase 3 napomene (S2/S5/S7).
- `mem://architecture/storage-and-persistence-v6` — dokumentovati `runMany` (S10) i `notifyCorruptCards` (S4).
- Razmotriti novi `mem://features/health-monitor-v3` ako S4 doda novi metric.

**Ono što NIJE u scope-u:** A1d (full Dexie removal), Pure-Desktop redo signalisanje, mnemonic refaktor.

Nakon prihvaćanja plana implementiraću po redoslijedu, sa verifikacijom (`tsc --noEmit` + targeted tests) nakon svake grupe.
