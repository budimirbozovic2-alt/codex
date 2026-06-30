# Tehnički dug — backlog (post UX sprint + test matrica)

Datum: 2026-06-14  
Kontekst: UX sprint zatvoren, UX test matrica (46 testova) implementirana, Source Reader audit P0/P1 riješen.

Procjena: **Fibonacci SP** (1, 2, 3, 5, 8, 13). Rizik: nizak / srednji / visok.

---

## TD-1 · Stabilizacija flaky CI testova

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 5 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** Pod punim paralelnim `npm test --run` povremeno padaju sporiji testovi (10s timeout), iako izolovano prolaze.

**Fajlovi:**
- [`src/test/backlink-index.test.ts`](src/test/backlink-index.test.ts) — perf test 1k članaka
- [`src/test/import-transaction-split.test.ts`](src/test/import-transaction-split.test.ts) — `>1000 cards` yieldUI
- [`src/test/pr-h2-mutation-safety-net.test.ts`](src/test/pr-h2-mutation-safety-net.test.ts)
- [`src/test/phase-a-p0.test.tsx`](src/test/phase-a-p0.test.tsx) — CardForm mount
- [`src/test/boot-deferred-cards.test.ts`](src/test/boot-deferred-cards.test.ts)
- [`src/test/subject-cards-view.integration.test.tsx`](src/test/subject-cards-view.integration.test.tsx)
- [`vitest.config.ts`](vitest.config.ts) — po potrebi `testTimeout`, `pool`, `fileParallelism`

**Predlog rješenja:**
1. Povećati `testTimeout` samo na perf/integration describe blokove (npr. 20–30s).
2. Označiti perf testove tagom `@slow` i isključiti iz default CI profila ili pokretati u `test:ci:slow` jobu.
3. Za SQLite-heavy testove: `beforeEach` reset + izbjegavanje paralelnog contention-a (`maxWorkers: 1` samo za te fajlove ako treba).

**DoD:**
- Tri uzastopna punа `npm test --run` lokalno bez timeout regresija.
- CI profil dokumentovan u README ili `package.json` script.

**Implementirano:** `src/test/helpers/test-timeouts.ts` (`SLOW_TEST_TIMEOUT_MS` 30s, `INTEGRATION_TEST_TIMEOUT_MS` 20s); `describe(..., { timeout })` na sporim describe blokovima; `hookTimeout: 15000` u `vitest.config.ts`; `npm run test:ci` alias.

---

## TD-2 · CategoryView: odvojiti mastery query od punog cards load-a

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 5 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** [`CategoryView.tsx`](src/views/CategoryView.tsx) drži `useCardsByCategoryWithStatus` za mastery distribuciju; reader više ne treba pun scope, ali parent i dalje dekodira sve kartice predmeta (skupo za velike kataloge). Dokumentirano u [`docs/source-reader-audit-report.md`](docs/source-reader-audit-report.md) §8.

**Fajlovi:**
- [`src/views/CategoryView.tsx`](src/views/CategoryView.tsx)
- [`src/hooks/card/useCardsQuery.ts`](src/hooks/card/useCardsQuery.ts) — novi hook npr. `useMasteryDistributionByCategory`
- [`src/lib/db/queries/cards.ts`](src/lib/db/queries/cards.ts) — SQL agregat po mastery nivoima
- [`src/test/category-view-loading.test.tsx`](src/test/category-view-loading.test.tsx) — proširiti
- Novi: `src/test/category-mastery-distribution.test.ts`

**Predlog rješenja:**
- SQL agregat: `COUNT(*) GROUP BY mastery_level` (ili postojeći `cards.mastery_score` + bucket map).
- CategoryView koristi lagani hook umjesto punog `cards[]` za mastery traku.

**DoD:**
- CategoryView ne poziva `useCardsByCategoryWithStatus` samo radi mastery trake.
- Mastery UI i dalje tačan; test pokriva prazan / pun katalog.

**Implementirano:** `mastery_level` denorm kolona + `masteryDistributionByCategoryFromDb` + `useMasteryDistributionByCategory`; CategoryView refaktor; `category-mastery-distribution.test.ts`, proširen `category-view-contract.test.ts`.

---

## TD-3 · Ubrzanje SourceContent autosave testova

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 2 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** [`src/test/source-content-autosave.test.tsx`](src/test/source-content-autosave.test.tsx) koristi realno `tick(1100)` — ~4s po fajlu, usporava pun suite.

**Fajlovi:**
- [`src/test/source-content-autosave.test.tsx`](src/test/source-content-autosave.test.tsx)
- [`src/lib/scheduler/taskScheduler.ts`](src/lib/scheduler/taskScheduler.ts) — `__resetForTests` već postoji
- [`src/test/helpers/timers.ts`](src/test/helpers/timers.ts)

**Predlog rješenja:**
- `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(1000)` uz stabilan `useSourceMutations` mock (već riješeno).
- `taskScheduler.__resetForTests()` u `beforeEach`.

**DoD:**
- Isti assert-i, ukupno trajanje fajla < 500ms.

**Implementirano:** autosave describe koristi `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(1000)` + `taskScheduler.__resetForTests()`; draft recovery describe ostaje na real timers.

---

## TD-4 · Locale guard — ojačati static scan

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 3 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** [`src/test/locale-core-flow.test.ts`](src/test/locale-core-flow.test.ts) koristi regex blocklist; ne pokriva sve EN varijante ni template literale.

**Fajlovi:**
- [`src/test/locale-core-flow.test.ts`](src/test/locale-core-flow.test.ts)
- Core flow iz DoD: `Dashboard.tsx`, `ReviewSession.tsx`, `LearnSession.tsx`, `CategoryView.tsx`, `SourceContent.tsx`, `SessionChrome.tsx`, `PageHeader.tsx`
- Po potrebi: [`src/views/DashboardPage.tsx`](src/views/DashboardPage.tsx), [`src/views/ReviewPage.tsx`](src/views/ReviewPage.tsx), [`src/views/LearnPage.tsx`](src/views/LearnPage.tsx)

**Predlog rješenja:**
- Dodati allowlist fajl `src/test/fixtures/locale-allowlist.txt`.
- Skenirati i `` ` `` template literale u user-facing kontekstu.
- Fail poruka: putanja + linija + predloženi ME ekvivalent.

**DoD:**
- Test hvata poznati EN pattern koji blocklist trenutno propušta (1 synthetic fixture test).
- Nema false positive na Tailwind/className.

**Implementirano:** `src/test/helpers/locale-scan.ts`, `fixtures/locale-allowlist.txt`, template literal scan + synthetic violation fixture u `locale-core-flow.test.ts`.

---

## TD-5 · Playwright E2E — Source Reader edit + bubble menu

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 8 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-15) |

**Problem:** Audit §4 — TipTap Floating UI nije pouzdan u jsdom; unit testovi mockuju EditorV4. Nema E2E za edit, format toggle, smart split confirm.

**Fajlovi:**
- Novi: `e2e/source-reader-edit.spec.ts` (ili postojeći e2e folder)
- [`src/components/source-reader/SourceContent.tsx`](src/components/source-reader/SourceContent.tsx)
- [`src/components/source-reader/SourceBubbleMenu.tsx`](src/components/source-reader/SourceBubbleMenu.tsx)
- [`src/components/source-reader/SourceToolbar.tsx`](src/components/source-reader/SourceToolbar.tsx)
- [`playwright.config.ts`](playwright.config.ts) — ako postoji

**Predlog rješenja:**
- Smoke: otvori izvor → uključi edit → ukucaj tekst → sačekaj save chip „Sačuvano”.
- Smoke: selekcija teksta → bubble menu vidljiv.

**DoD:**
- E2E prolazi u CI (headless Chromium).
- Dokumentovan seed/fixture za test kategoriju + izvor.

**Implementirano:** `playwright.config.ts`, `e2e/source-reader-edit.spec.ts`, `src/e2e/bridge.ts` + `seed-reader-fixture.ts` (`window.__codexE2E`), `.env.e2e` (`VITE_E2E=1`), [`docs/e2e-fixtures.md`](docs/e2e-fixtures.md), `npm run test:e2e`.

---

## TD-6 · Stats / Planner charts vizuelni sprint (P3)

| | |
|---|---|
| **Prioritet** | P3 |
| **SP** | 8 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-15) |

**Problem:** UX plan namjerno odložio „Charts/data-viz restyling”. PageHeader/glass-card su urađeni; grafici i widgeti na Stats/Planner ekranima nisu ujednačeni.

**Fajlovi:**
- [`src/views/StatsPage.tsx`](src/views/StatsPage.tsx)
- [`src/views/DashboardPage.tsx`](src/views/DashboardPage.tsx) — planner widgeti
- [`src/components/dashboard/StudyFlowWidget.tsx`](src/components/dashboard/StudyFlowWidget.tsx)
- [`src/components/ui/PageHeader.tsx`](src/components/ui/PageHeader.tsx) — već postoji
- Komponente u `src/components/stats/` (ako postoje)

**Predlog rješenja:**
- `text-eyebrow`, `glass-card`, usklađene boje mastery/burnup chartova sa design tokenima.
- Snapshot ili visual regression samo za statičke kartice (bez full chart pixel diff).

**DoD:**
- Stats + Planner koriste isti header/skeleton pattern kao Dashboard.
- Nema regresije u postojećim stats unit testovima.

**Implementirano:** `StatsPage` / `PlannerPage` → `DataReadyGate` + `DashboardSkeleton` + `space-y-8 animate-fade-in`; `RetentionChart`, `ActivityHeatmap`, `LatencyTab`, `CalibrationTab`, `DisciplineTab`, `StrategicPlanner` tab bar → `glass-card` / `text-eyebrow`; `OverviewTab` mastery pie → `MASTERY_LEVELS` tokeni; `src/test/stats-planner-shell.test.tsx`.

---

## TD-7 · API barrel audit (`@/lib/*` export konzistentnost)

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 3 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** [`SourceContent.tsx`](src/components/source-reader/SourceContent.tsx) importovao `getDraft` iz [`@/lib/drafts`](src/lib/drafts/index.ts) prije nego što je barrel exportovao — runtime `undefined`. Sličan rizik na drugim barrelima.

**Fajlovi:**
- [`src/lib/drafts/index.ts`](src/lib/drafts/index.ts) — već popravljeno
- Svi `src/lib/*/index.ts` barreli
- Novi: `src/test/api-barrel-exports.test.ts` — static: svaki named import iz `@/lib/X` u `src/` mora postojati u barrel exportu

**Predlog rješenja:**
- Skripta/test koja parsira import `{ a, b } from "@/lib/foo"` i provjerava `export` u `foo/index.ts`.
- ESLint rule (opcionalno) `no-restricted-imports` za deep paths.

**DoD:**
- Test prolazi na cijelom `src/`.
- Nema novih deep importa van allowlist-a.

**Implementirano:** [`src/test/api-barrel-exports.test.ts`](src/test/api-barrel-exports.test.ts) — static scan named importa iz `@/lib/{module}` vs `src/lib/{module}/index.ts` exporti.

---

## TD-8 · UX P0 checklist — QA traceability matrix

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 2 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-14) |

**Problem:** UX plan DoD #7: „Svaki P0 checklist ID ima test ili manual QA step dokumentovan u PR opisu” — testovi postoje, ali nema jedne traceability tabele ID → test/QA.

**Fajlovi:**
- Novi: [`docs/ux-p0-traceability.md`](docs/ux-p0-traceability.md)
- Mapiranje na test fajlove:
  - `source-content-autosave.test.tsx` (Sprint 1 autosave)
  - `category-view-deep-link.test.tsx` (deep-link)
  - `main-layout-immersive.test.tsx`, `ui-store-immersive-lifecycle.test.tsx` (immersive)
  - `session-chrome.test.tsx`, `review-card-progress.test.tsx` (progress)
  - `loading-gates.test.tsx` (skeletoni)
  - `active-phase.test.ts` (D-P2-3)
  - `save-status-chip.test.tsx`, `page-header.test.tsx`, `locale-core-flow.test.ts`
- Referenca: [`C:\Users\Aleksandar\.cursor\plans\ux_audit_sprint_plan_a07a7dc1.plan.md`](../.cursor/plans/) (checklist ID-evi)

**DoD:**
- Tabela: Checklist ID | Feature | Automatski test | Manual QA korak | Status.
- Svi P0 ID-evi iz originalnog plana imaju red.

**Implementirano:** [`docs/ux-p0-traceability.md`](docs/ux-p0-traceability.md) — 12 P0 ID-eva (SR/CAT/X/R) mapiranih na test fajlove i manual smoke korake.

---

## TD-ARCH serija — arhitekturni refaktoring (jun 2026)

Master plan: [`docs/architecture-refactoring-plan.md`](architecture-refactoring-plan.md)

| ID | Faza | SP | Rizik | Status |
|----|------|-----|-------|--------|
| TD-ARCH-1 | Foundation cleanup (storage facade, tipovi, komentari) | 3 | nizak | ✅ Done (2026-06-22) |
| TD-ARCH-2 | Write path unifikacija (card repository) | 8 | srednji | ✅ Done (2026-06-22) |
| TD-ARCH-3 | Direct TanStack invalidation iz repositories | 13 | srednji | ✅ Done (2026-06-22) |
| TD-ARCH-4 | Cache coordinator collapse → `writeSession` | 13 | srednji–visok | ✅ Done (2026-06-22) |
| TD-ARCH-5 | Event bus + bridges uklanjanje | 8 | visok | ✅ Done (2026-06-22) |
| TD-ARCH-6 | Boot simplification (linear boot) | 8 | srednji | ✅ Done (2026-06-22) |
| TD-ARCH-7 | Migration consolidation | 13 | visok | ✅ Done (2026-06-22) |
| TD-ARCH-8 | Schema normalizacija (FSRS sekcije) | 21 | visok | ✅ Done (2026-06-22) |
| TD-ARCH-9 | Analytics worker audit | 3 | nizak | ✅ Done (2026-06-22) |
| TD-ARCH-10 | Cleanup & verification | 5 | nizak | ✅ Done (2026-06-22) |

### TD-ARCH-10 · Cleanup & verification

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 5 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- Obrisani deprecated barreli: `cards-/categories-/review-settings-cache-coordinator`, `all-caches-coordinator`, `bulk-write-session-depth`, `workerClient`, `useAnalyticsWorker`, `boot-dag`, `card-sections-index`, `storage.ts`, `settings-cache`
- Svi importi → `cache-coordinator`, `write-session`, `prefs-cache-coordinator`, `@/lib/boot`, `card-sections`, `@/lib/types/logs`, `@/lib/backup/backup-metadata`
- `syncCardSectionsMany` umjesto `syncCardSectionsIndexMany`
- `tsc --noEmit` zelen; test suite prolazi (bench budžeti 150/200/350ms)
- **Preostalo (ručno):** P3 desktop smoke checklist

---

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 3 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- Tipovi → `@/lib/types/logs`
- Pomodoro → `@/lib/services/pomodoroStats`
- Backup metadata → `@/lib/backup/backup-metadata`
- Browser quota → `@/lib/services/browser-storage-estimate`
- Learn progress → `@/lib/db/queries` direktno
- `storage.ts` obrisan (TD-ARCH-1b zatvoren u Fazi 10)

### TD-ARCH-2 · Write path unifikacija

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 8 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `cardRepository` — jedini public card write API (uključujući taxonomy bulk metode)
- Obrisani `cards-writes.ts`, `cards-bulk-mutations.ts`
- `db/queries` barrel — samo reads + notify za kartice
- Migrirani: `useCategoryManagement`, `healthService`, `useCardImport`, e2e seed, persistence contract testovi
- ESLint guard za deep card-write imports

### TD-ARCH-3 · Direct invalidation

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 13 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `cards-invalidation.ts` + `categories-invalidation.ts`
- Repository/notify path invalidira TanStack odmah
- Bridge dedup (`bridges.cards.skip.direct`, `bridges.categories.skip.direct`)
- Debounce zadržan samo za bus-only legacy emitere

### TD-ARCH-4 · Cache coordinator collapse

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 13 |
| **Rizik** | srednji–visok |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `cache-coordinator.ts` — unified cards/categories/review cache
- `write-session.ts` — `runWriteSession`, bulk depth, satellite sync
- Deprecated re-export barreli za stare import putanje
- `useCardImport.importCards` pojednostavljen na `runWriteSession`

**Preostalo:** Nema — deprecated barreli obrisani u TD-ARCH-10.

### TD-ARCH-5 · Event bus + bridges uklanjanje

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 8 |
| **Rizik** | visok |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `domain-invalidation.ts` — direct TanStack invalidation za satellite domene
- `cache-scope-types.ts` — scope tipovi odvojeni od event bus-a
- Obrisan `bridges.ts`; `client.ts` bez `installQueryBridges`
- `event-bus.ts` zadržan samo za DB infrastrukturne evente
- Testovi: `domain-invalidation.test.ts`; obrisani bridge-specific testovi

### TD-ARCH-6 · Boot simplification

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 8 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `lib/boot/boot.ts` — linearan `boot()` orchestrator
- `lib/boot/seed-query-caches.ts` — `seedAllQueryCaches()`
- Uklonjen 22s panic timer; splash samo preko FSM bridge-a
- `boot-dag.ts` deprecated re-export

### TD-ARCH-7 · Migration consolidation

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 13 |
| **Rizik** | visok |
| **Status** | ✅ Done (2026-06-22) |

**Implementirano:**
- `migration-runner-v2.ts` — fresh install clean schema
- `post-migration-heals.ts` — version-window gated heals + logging
- `clean-schema-addon.sql` — final DDL za nove instalacije
- `docs/migration-heals.md` — heal registry dokumentacija
- `migration-consolidation.test.ts`

---

## TD-ZK serija — Zettelkasten ↔ učenje integracija (jun 2026)

Zatvara izolovanost Zettelkasten modula od ostatka programa: kartice i članci sada dijele koncept-vezu, a zdravlje review-a se vidi u wiki mreži.

| ID | Faza | SP | Rizik | Status |
|----|------|-----|-------|--------|
| TD-ZK-1 | Članak ↔ kartica concept link | 16 | srednji | ✅ Done (2026-06-29) |
| TD-ZK-3 | Endangered signal u Zettelkasten | 4 | nizak | ✅ Done (2026-06-29) |

### TD-ZK-1 · Članak ↔ kartica concept link

| | |
|---|---|
| **Prioritet** | P1 |
| **SP** | 16 |
| **Rizik** | srednji |
| **Status** | ✅ Done (2026-06-29) |

**Problem:** Kartice (flash/esej) i Zettelkasten članci žive odvojeno — nema veze između pojma u wikiju i kartica koje ga obrađuju.

**Implementirano:**
- Schema **v18** (`linkedArticleId` kolona, FK `ON DELETE SET NULL`, indeks) — vidi [architecture-refactoring-plan.md](architecture-refactoring-plan.md) Faza 8
- `row-codecs.ts` (kolona + payload), `backup-schema/cards.ts` (Zod + transform) — veza preživljava export/import
- `cardRepository.linkCardToArticle` / `linkCardsToArticle`; `deleteArticle` nulira veze (bez dangling)
- Read: `listCardsByArticle` / `countCardsByArticle`; hook `useCardsByArticle` (derivacija iz category cache-a)
- UI: `LinkedCardsPanel` + `LinkCardsToArticleDialog` u `ZettelkastenView`; „Otvori pojam" u `CardForm`
- Testovi: `card-article-link.test.ts`, `card-article-link-ui.test.tsx`; `sqlite-harness` json-setteri

**DoD:**
- [x] `linkedArticleId` round-trip kroz kolonu + payload + backup
- [x] Link/unlink/bulk preko `cardRepository`; cleanup pri brisanju članka
- [x] Article-strana UI (lista, povezivanje, otvaranje); card-strana navigacija
- [x] `tsc`/eslint/suite zeleni

**Preostalo (opciono, zaseban tiket):** Faza D2 — picker članka unutar `CardForm` za postavljanje veze sa strane kartice (trenutno samo sa strane članka).

### TD-ZK-3 · Endangered signal u Zettelkasten

| | |
|---|---|
| **Prioritet** | P2 |
| **SP** | 4 |
| **Rizik** | nizak |
| **Status** | ✅ Done (2026-06-29) |

**Problem:** `isEndangered` postoji na karticama, ali wiki ne odražava zdravlje review-a — ne vidi se koji dio mreže znanja slabi.

**Implementirano:**
- `buildEndangeredArticleIds` (pure) + `useEndangeredArticleIds` (derivacija iz category cache-a, stabilan Set identitet zbog memo Explorer-a)
- `ZettelExplorerPanel` — `AlertTriangle` indikator (`ENDANGERED_CONCEPT_LABEL`) na ugroženom članku
- `BacklinksPanel` — highlight (`border-warning`) + tooltip „Ovaj dio tvoje mreže znanja slabi"
- Test: `endangered-zettel-ui.test.tsx`

**DoD:**
- [x] Derivacija bez novog upita (vozi se na postojećoj card invalidaciji)
- [x] Indikator u Explorer-u i highlight backlinka
- [x] `tsc`/eslint/suite zeleni

**Granica obima:** signal = `card.isEndangered` na povezanoj kartici; ne ide dublje u saga lanac.

---

## Preporučeni redoslijed (2 sprinta)

| Sprint | Tiketi | SP ukupno |
|--------|--------|-----------|
| **A — stabilnost** | TD-1, TD-3, TD-7 | ~10 |
| **B — kvalitet + perf** | TD-2, TD-4, TD-8 | ~10 |
| **C — product polish** | TD-5, TD-6 | ~16 |

**Namjerno van ovog backloga (product odluka, ne bug):**
- Full i18n framework (13+ SP, zaseban epic)
- Electron-only TitleBar polish izvan postojećih testova (već pokriveno `title-bar-context.test.tsx`)

---

## Brza provjera nakon svakog tiketa

```bash
cd memoria-mne
npm test -- --run
npx tsc --noEmit
```

Za TD-5 dodatno:

```bash
npx playwright test
```
