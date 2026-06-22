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
| TD-ARCH-2 | Write path unifikacija (card repository) | 8 | srednji | ⏳ Backlog |
| TD-ARCH-3 | Direct TanStack invalidation iz repositories | 13 | srednji | ⏳ Backlog |
| TD-ARCH-4 | Cache coordinator collapse → `writeSession` | 13 | srednji–visok | ⏳ Backlog |
| TD-ARCH-5 | Event bus + bridges uklanjanje | 8 | visok | ⏳ Backlog |
| TD-ARCH-6 | Boot simplification (1 FSM) | 8 | srednji | ⏳ Backlog |
| TD-ARCH-7 | Migration consolidation | 13 | visok | ⏳ Backlog |
| TD-ARCH-8 | Schema normalizacija (FSRS sekcije) | 21 | visok | ⏳ Backlog (opciono) |
| TD-ARCH-9 | Analytics worker audit | 3 | nizak | ⏳ Backlog |

### TD-ARCH-1 · Foundation cleanup

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
- `storage.ts` → deprecated re-export barrel
- Stale WASM komentar u `main.tsx` ispravljen

**Preostalo za uklanjanje barrel-a:** TD-ARCH-1b — obriši `storage.ts` kad mock testovi pređu na nove module.

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
