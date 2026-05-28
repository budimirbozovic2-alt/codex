## Phase 4 — TanStack Query Gap Sweep

Audit citat iz `audit-post-phase3-architecture-grade.md` (sekcija 2.1) je zastario. Trenutno stanje:

- **8 useQuery hook fajlova** (svih 6 domena pokriveno: cards, sources, planner, mindMaps, mnemonics, knowledgeBase, + `useCardViewFilters`).
- **7 useMutation hook fajlova** sa `onMutate / snapshot / setQueryData / onError rollback` patternom.
- Bridges aktivno servisiraju invalidaciju za svih 6 domena; `CARDS_DEBOUNCE_MS=16` je u hot path-u.

Pilot iz audita (`useCardsByCategory → useQuery`, `updateCard → useMutation`) **već postoji** od PR-7f / B1 i pokriven je testovima. Umjesto duplikata, ovaj plan adresira stvarne rupe koje skeniranje hookova otkriva.

---

### Tier A — Korektnost / arhitekturni zidovi

**A1. Ad-hoc `setQueryData` van mutacije (Zettelkasten).**
`src/hooks/zettelkasten/useZettelkastenBootstrap.ts:89-101` izlaže `setArticles` kao `Dispatch<SetStateAction>` koji direktno piše u `queryKeys.knowledgeBase.byCategory()`. Koriste ga `useArticleDraft`, `useWikiLinkAutoCreate`, i historijska mutation call-sites. Probleme stvara jer:
- Nema `cancelQueries` → race protiv refetch-a.
- Nema snapshot/rollback → optimistički cache ostaje zaglavljen ako underlying write padne.
- Bypasuje `useKnowledgeBaseMutations.save` koji ima cijeli pattern.

**Fix:** identifikovati sve call-site-ove `setArticles`, presresti ih da idu kroz `useKnowledgeBaseMutations.save / remove / bulkCreate`. Ako neki call-site radi samo lokalnu reordering optimizaciju (sortiranje liste bez DB write-a), zadržati ga uz eksplicitnu napomenu da je čisto UI-side. `setArticles` u `BootstrapResult` interfejsu postaje `@deprecated`, kasnije se uklanja.

**A2. `*Ram` selectors curi kroz public `@/store` barrel.**
`src/store/index.ts:33-37` re-eksportuje `useCardsByCategoryRam`, `useCardsBySubcategoryRam`, `useCardsByChapterRam`, `useCardCountByCategoryRam`, `useCardByIdRam`. Production callers ne smiju da ih koriste (TanStack je SSOT po Core memory pravilu), ali nema mehanizma koji to sprečava. ESLint pravilo "Public API Walls" (mem://architecture/public-api-walls) postoji, ali ovde dozvoljava import.

**Fix:** izbaciti `*Ram` varijante iz `src/store/index.ts`. Test fajlovi (`src/test/card-selectors.test.tsx`) importuju direktno iz `@/store/useCardSelectors` (dozvoljeno iz `src/test/**` ESLint override-om). Dodati ESLint pravilo W9: zabrana `*Ram` selectora van `src/test/**` i `src/store/useCardSelectors.ts`.

---

### Tier B — Bačeni rad / fragilnost

**B1. `usePlannerData` 9-poziva ručna invalidation kaskada.**
`src/hooks/usePlannerData.ts:62-89` ima 3 `useEffect` bloka koja ručno invalidiraju 9 planner queryKey-eva na svaku promjenu hash-a (reviewLogHash, cardsHash, categoryHash, configHash, velocity, remaining). Problemi:
- Duplira posao bridge-a (`onPlannerChanged → invalidate(['planner'])`).
- Effect dependencies su nestabilni (`velocity` se računa kroz useQuery koji upravo invalidira → efekat retrigeruje).
- 9 zasebnih `invalidateQueries` poziva u istom ticku umjesto jednog batch-a.

**Fix:** dvije opcije, biramo opciju 2:
1. ~~Hash u queryKey~~ — bloati cache (već odbačeno komentarom na liniji 73).
2. **Eliminisati useQuery za pure-sync derived calcove**: `velocity`, `estimatedFinish`, `plannerStatus`, `subjectPlans`, `smartSuggestion`, `timeRec`, `projectionText`, `burnup`, `phaseDisciplinePct`, `retentionRisk` su sve čiste funkcije inputa (`reviewLog`, `cards`, `config`, `categoryRecords`). Premjestiti ih u `useMemo` blokove → 0 invalidacionih efekata, 0 queryFn poziva, 0 cache eviction. Sačuvati useQuery samo za async I/O reads: `config` (loadPlanner), `disciplineLog` (loadDisciplineLog), `disciplineTrend` (getDisciplineTrend), `retentionRisk` (analyticsClient.runCategoryStability — Web Worker).

Očekivan efekat: planner re-render storm na svakom card-grade-u nestaje; cache footprint -7 query slot-ova; broj invalidateQueries poziva po grade-u: 5 → 0.

**B2. Planner `saveConfig` — optimistic seed je no-op.**
`src/hooks/planner/usePlannerMutations.ts:32-49`: `onMutate` seeda `queryKeys.planner.config()` sa novom cfg, zatim `mutationFn` zove `mod.savePlanner(cfg)` koji je sinkroni i unutar sebe poziva `notifyPlannerChanged("config")` → bridge u istom ticku invalidira `['planner']` root → `queryKeys.planner.config()` se refetcha (`loadPlanner()` vraća istu cfg). Optimistički seed nikada nije vidljiv UI-u.

**Fix:** ukloniti optimistic `setQueryData` u `saveConfig.onMutate`. Zadržati samo `cancelQueries + snapshot` za rollback. Isto provjeriti za `recordDiscipline` (već koristi taj pattern, OK) i `incrementMapped` (već no-op, OK).

**B3. KB `headers` query refetcha u lockstep-u sa full articles.**
`src/hooks/zettelkasten/useKnowledgeBaseArticles.ts:57-68` (`useKnowledgeBaseHeadersBySubject`) koristi key `[...queryKeys.knowledgeBase.byCategory(subjectId), "headers"]`. Bridge invalidira `['knowledgeBase']` prefix → headers i full lista refetchaju zajedno → dva DB poziva za jedan write.

**Fix:** derivirati headers iz `useKnowledgeBaseArticlesBySubject` kroz `select` opciju iste useQuery instance:
```ts
const { data } = useQuery({
  queryKey: queryKeys.knowledgeBase.byCategory(subjectId),
  queryFn: () => loadArticlesBySubject(subjectId),
  select: (rows) => rows.map(({ id, title, updatedAt, isIndex }) => ({ id, title, updatedAt, isIndex })),
});
```
`select` se memoizuje po referencu rezultata, pa konzumeri koji žele headers dobiju stabilan output bez parsiranja payload-a. `listArticleHeadersBySubject` ostaje kao DB query (koristi se u backup/health), ali React hook se uklanja.

---

### Tier C — UX rupe

**C1. Nedostaje `placeholderData: keepPreviousData` na key-switching query-ima.**
- `useMnemonicCards(categoryFilter)` — promjena filtera → flash na empty.
- `useKnowledgeBaseArticlesBySubject(subjectId)` — switch subject-a u Zettel-u → prazna lista dok refetcha.
- `useCategorySources(categoryId)` — kategorija swap (već riješeno za cards pilotom `CategoryHeaderSkeleton`, ali sources tab unutra još uvijek flashuje).
- `useMindMap(id)` — switch mind map-a.

**Fix:** dodati `placeholderData: keepPreviousData` na 4 navedene useQuery instance. Smoothuje key-switching tranzicije bez novog koda — TanStack zadržava prethodni `data` dok novi fetch ne riješi. `isFetching` ostaje `true` → može se koristiti za suptilni shimmer overlay (van scope-a pilota).

**C2. Prefetch on hover (out of scope, samo notirano).**
SubjectSwitcher / kategorija lista bi mogli `qc.prefetchQuery(queryKeys.cards.byCategory(id))` na hover. Ostavljeno za buduću UX iteraciju.

---

### Plan implementacije (redoslijed)

1. **A2** (sigurnosna mreža): izbaciti `*Ram` iz `@/store/index.ts`, dodati ESLint W9, popraviti test importe.
2. **B2** (najmanji blast radius): ukloniti optimistic seed u `saveConfig.onMutate`.
3. **C1**: dodati `placeholderData: keepPreviousData` na 4 hook-a (1-line po hook-u).
4. **B3**: konvertovati `useKnowledgeBaseHeadersBySubject` u `select` nad `byCategory` query-jem; ažurirati call-sites.
5. **B1** (najveći): refaktorisati `usePlannerData` — `velocity / estimatedFinish / plannerStatus / subjectPlans / smartSuggestion / timeRec / projectionText / burnup / phaseDisciplinePct` postaju `useMemo`, ostaju samo `config / disciplineLog / disciplineTrend / retentionRisk` kao useQuery. Brisati 3 invalidation `useEffect` bloka.
6. **A1** (najviše dodira): popisati `setArticles` callere u Zettel-u; presresti DB-pisanje na mutation hook-ove; ostaviti `setArticles` samo za čisto-UI updejte (sortiranje); označiti `@deprecated`.

### Tehnički detalji

- **Test pokrivenost koja mora ostati zelena:** `card-selectors.test.tsx`, `query-bridges.test.ts`, `category-view-loading.test.tsx`.
- **Novi testovi:**
  - Planner: `usePlannerData.derivations.test.ts` — verifikuje da promjena cards/reviewLog input-a daje novi `velocity` bez dodatnih DB read-ova (mock `loadPlanner`).
  - KB headers: test da `useKnowledgeBaseHeadersBySubject` rezultat dijeli referencu kroz `select` memoizaciju.
  - Mnemonics: test za `keepPreviousData` ponašanje pri promjeni filtera.
- **ESLint W9 pattern** (dodati u `eslint.config.js`):
  ```js
  {
    files: ["src/**/*.{ts,tsx}"],
    excludedFiles: ["src/test/**", "src/store/useCardSelectors.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/store"],
          importNames: ["useCardsByCategoryRam","useCardsBySubcategoryRam","useCardsByChapterRam","useCardCountByCategoryRam","useCardByIdRam"],
          message: "Use TanStack selectors (without Ram suffix). *Ram is test-only.",
        }],
      }],
    },
  }
  ```
- **Bundle delta:** očekivano −2 do −4 KB gzipped (uklonjeni planner useQuery overhead-i + uklonjen `listArticleHeadersBySubject` React hook obuhvat).

### Acceptance Criteria

- `tsc --noEmit` clean.
- Sva postojeća pokrivenost ostaje zelena (uključujući 600/601 baseline, ne pogoršavamo failure count).
- Nova test pokrivenost A2/B1/B3/C1.
- `rg "useCardsByCategoryRam|useCardsBySubcategoryRam|useCardsByChapterRam|useCardCountByCategoryRam|useCardByIdRam" src --glob '!src/test/**' --glob '!src/store/useCardSelectors.ts'` → 0 hits.
- Planner: card-grade event više ne fire-uje 5 `invalidateQueries` poziva (mjeri se kroz `_resetBridgesForTest` spy).
- Zettel: nakon ovog pilota, `setArticles` u Zettel callerima koristi se samo za UI sort (max 1-2 call site-a), ostalo prolazi kroz `useKnowledgeBaseMutations`.

### Scope ograničenja

- Bez novih UI komponenti (skeleton/Suspense rad iz prethodnog pilota se ne dira).
- Bez prefetch implementacije (C2).
- Bez promjene `queryKeys` strukture (osim brisanja KB headers ako se može u istom keyu kroz `select`).
- Bez diranja boot performance / SQLite executor-a.

**Effort:** ~400-500 LOC izmjena (najveći deo u `usePlannerData`), 1.5 dana implementacija + 0.5 QA.