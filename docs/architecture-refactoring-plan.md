# Plan arhitekturnog refaktoringa

Datum: 2026-06-22  
Cilj: Aplikacija nakon refaktoringa djeluje kao da je **strateški planirana od nule** — jedan jasan data flow, bez slojeva nastalih inkrementalnom evolucijom.

Referenca: analiza arhitekture (jun 2026), postojeći [`technical-debt-backlog.md`](technical-debt-backlog.md).

---

## Ciljno stanje (target architecture)

```
React komponente
    ↓ hooks (orchestration)
TanStack Query (jedini read cache)
    ↓ SqlExecutor / IPC
SQLite u main procesu (SSOT)
    ↑
Repository (jedini write path) → invalidateQueries u onSettled
```

**Principi:**
- Jedan read cache (TanStack Query), bez domain RAM keševa
- Jedan write path po entitetu (repository), bez event bus-a
- Jedan boot flow, bez paralelnih FSM-ova
- Eksplicitne migracije, bez `SELECT 1` placeholdera
- Pure domain logika (`domains/*`, `lib/sr/*`, `lib/analytics/_pure/*`) ostaje netaknuta

---

## Faze po prioritetu

| Faza | Naziv | SP | Rizik | Pojednostavljenje | Status |
|------|-------|-----|-------|-------------------|--------|
| **1** | Foundation cleanup | 3 | nizak | Uklanjanje legacy facades, tipovi, komentari | ✅ Done |
| **2** | Write path unifikacija | 8 | srednji | 3 card write path-a → 1 repository | ✅ Done |
| **3** | Direct invalidation | 13 | srednji | Repository → TanStack direktno, bridge dedup | ✅ Done |
| **4** | Cache coordinator collapse | 13 | srednji–visok | 4 koordinatora → write-session + cache-coordinator | ✅ Done |
| **5** | Event bus uklanjanje | 8 | visok | bridges.ts → direct invalidation | ✅ Done |
| **6** | Boot simplification | 8 | srednji | boot DAG + panic → linear `boot()` | ✅ Done |
| **7** | Migration consolidation | 13 | visok | SELECT 1 heals → `runPostMigrationHeals` | ✅ Done |
| **8** | Schema normalizacija | 21 | visok | JSON card payload + denorm indeksi → relacione FSRS sekcije | ✅ Done |
| **9** | Worker audit | 3 | nizak | Analytics worker samo ako profiling pokaže potrebu | ✅ Done |
| **10** | Cleanup & verification | 5 | nizak | Deprecated barreli, zelen CI, ručni smoke | ⏳ TD-ARCH-10 |

**Ukupno:** ~90 SP (~4–5 sprinta od 2 sedmice).

---

## Faza 1 — Foundation cleanup ✅ (implementirano 2026-06-22)

**Cilj:** Ukloniti legacy facades i uspostaviti jasne import putanje bez promjene runtime ponašanja.

### Šta je urađeno

| Stavka | Prije | Poslije |
|--------|-------|---------|
| Tipovi logova | `@/lib/storage` | `@/lib/types/logs` |
| Pomodoro stats | `storage.ts` | `@/lib/services/pomodoroStats` |
| Backup timestamp | `storage.ts` | `@/lib/backup/backup-metadata` |
| Browser quota | `storage.ts` | `@/lib/services/browser-storage-estimate` |
| Learn progress | `storage.ts` wrapper | `@/lib/db/queries` direktno |
| Stale WASM komentar | `main.tsx` | Ispravljen na main-process SQLite |
| `storage.ts` | Aktivni facade | Deprecated re-export barrel |

### DoD
- [x] Svi production importi migrirani sa `@/lib/storage`
- [x] `storage.ts` označen `@deprecated`
- [x] Testovi prolaze
- [x] Plan dokumentovan

---

## Faza 2 — Write path unifikacija (TD-ARCH-2) ✅

**Problem:** Tri ulazna mjesta za card persistence:
- `lib/db/queries/cards.ts` — reads + notify
- `lib/repositories/cardRepository.ts` — primary writes
- `lib/db/queries/cards-writes.ts` + `cards-bulk-mutations.ts` — duplirani write helpers

**Implementirano (2026-06-22):**
1. `cardRepository` je jedini public write API — uključuje taxonomy bulk metode
2. `cards-writes.ts` i `cards-bulk-mutations.ts` obrisani
3. `db/queries` barrel više ne exportuje card write funkcije
4. Call site-ovi migrirani: `useCategoryManagement`, `healthService`, `useCardImport`, e2e seed, testovi
5. ESLint upozorenje za deep import card write modula i `cardRepository` izvan barrela

**DoD:**
- [x] Jedan import path za card writes u production kodu (`@/lib/repositories`)
- [x] Contract testovi ažurirani
- [x] `cards.ts` ostaje read-only

---

## Faza 3 — Direct invalidation (TD-ARCH-3) ✅

**Problem:** Write → event bus → bridges (debounce 16ms/250ms) → TanStack.

**Implementirano (2026-06-22):**
1. `lib/query/cards-invalidation.ts` — immediate scoped invalidation + bridge dedup
2. `lib/query/categories-invalidation.ts` — categoryRepository direct path
3. `emitCardsChanged` / `notifyCardsChanged` koriste direct invalidation
4. `bridges.ts` preskače cards/categories evente kad je direct path već invalidirao
5. Bridge debounce ostaje za legacy bus-only emitere (pre Faze 5)

**DoD:**
- [x] Single-card write ne čeka bridge debounce
- [x] Testovi ažurirani (`query-bridges.test.ts`, `cards-invalidation.test.ts`)
- [x] Nema double-invalidate na repository path-u

---

## Faza 4 — Cache coordinator collapse (TD-ARCH-4) ✅

**Problem:** 4 paralelna koordinatora + `all-caches-coordinator` + bulk-write depth.

**Implementirano (2026-06-22):**
1. `cache-coordinator.ts` — cards + categories + review/settings (jedan modul)
2. `write-session.ts` — `runWriteSession`, `runBulkCardsWrite`, bulk depth tracking
3. Stari fajlovi → deprecated re-export barreli (backward compat)
4. Production importi migrirani na nove module

**DoD:**
- [x] Bulk import prolazi testove
- [x] Jedan public API modul za write session + jedan za cache state
- [x] Generation guards i invarianti zadržani

---

## Faza 5 — Event bus uklanjanje (TD-ARCH-5) ✅

**Preduslov:** Faze 3 i 4 završene.

**Implementirano:**
1. `lib/query/domain-invalidation.ts` — direct invalidation za sources, mindmaps, mnemonics, knowledgeBase, planner derived
2. `lib/query/cache-scope-types.ts` — scope tipovi odvojeni od event bus-a
3. Uklonjen `bridges.ts` i `installQueryBridges()` iz `client.ts`
4. Svi `emitDomainChanged` call site-ovi migrirani na direct invalidation
5. `event-bus.ts` zadržan samo za DB infrastrukturu (`DB_BLOCKED`, `DB_UNBLOCKED`, `DB_ERROR_CHANGED`)

**DoD:**
- [x] Grep za `emitDomainChanged` = 0 u production kodu
- [x] Boot radi bez bridge install step-a
- [x] Testovi: `domain-invalidation.test.ts`, ažurirani write-session / bulk / e2e testovi

**Napomena:** `event-bus.ts` nije obrisan — i dalje služi za DB blocking UI.

---

## Faza 6 — Boot simplification (TD-ARCH-6) ✅

**Problem:** `bootStateMachine` + `readyMachine` + `boot-dag` + splash bridge + 22s panic + raspršeno cache seed-ovanje.

**Implementirano:**
1. **`lib/boot/boot.ts`** — linearan `boot(signal)`: `bootDb` → `runSchema` → `loadInitialData` → `seedAllQueryCaches` → `READY`
2. **`lib/boot/seed-query-caches.ts`** — `seedAllQueryCaches()` jedini TanStack seed entry point
3. Uklonjen 22s panic timer iz `useCardBootstrap` — `BootRecoveryGate` + `handleBootError` pokrivaju error path
4. `splashProgress` uklonjen iz `loadInitialData` — splashBridge mapira FSM faze
5. `boot-dag.ts` → deprecated re-export; testovi i dalje koriste `runBootDag` alias

**DoD:**
- [x] `boot-dag-*.test.ts` i `boot-deferred-cards.test.ts` prolaze
- [x] Boot trace (`markBootStep`) zadržan
- [x] Panic timer uklonjen

**Napomena:** `bootStateMachine` i `readyMachine` zadržani — FSM i SQLite lifecycle su odvojeni concerni; Faza 6 konsoliduje orchestrator, ne briše infrastrukturu.

---

## Faza 7 — Migration consolidation (TD-ARCH-7) ✅

**Problem:** Verzije 8–15 imaju `SELECT 1` SQL sa TS heal logikom poslije petlje; idempotent heals se pokreću i na fresh DB.

**Implementirano:**
1. Zamrznuti `MIGRATIONS` — historija netaknuta
2. **`migration-runner-v2.ts`** — `applyFreshSchema` za `user_version = 0`
3. **`post-migration-heals.ts`** — `runPostMigrationHeals()` sa version-window gating
4. **`docs/migration-heals.md`** — dokumentacija svakog heal koraka

**DoD:**
- [x] Fresh install: 1 schema apply, 0 heal koraka
- [x] Upgrade: jasan log `[migration:heal]` po koraku
- [x] Nema novih `SELECT 1` migracija

---

## Faza 8 — Schema normalizacija (TD-ARCH-8) ✅

**Problem:** Kartice su JSON payload + denormalizovani `card_sections_index`, saga links, endangered sync — kompleksno održavanje.

**Implementirano (2026-06-22):**
- Nova tabela `card_sections` sa punim FSRS poljima (state, stability, difficulty, interval_days, next_review, …)
- `syncCardSections` / `syncCardSectionsMany` u `card-sections.ts` zamjenjuju 4-kolonski indeks
- Migracija **v17** kreira `card_sections`, briše `card_sections_index`
- Due query-ji u `cards.ts` čitaju iz `card_sections`
- Heal `card-sections-normalized` (minVersion 17) + legacy v7 heal delegira kad tabela već postoji
- Fresh install: `clean-schema-addon.sql` uključuje `card_sections` (bez legacy indeksa)

### DoD
- [x] `card_sections` tabela + sync na svaki card write
- [x] Due/count query-ji prebačeni na SQL JOIN nad `card_sections`
- [x] Upgrade path v17 + post-migration heal
- [x] Testovi + harness ažuriran

### Naknadne schema migracije (post TD-ARCH)

| Verzija | Label | Svrha |
|---------|-------|-------|
| **v18** | `pr22-card-article-link` | TD-ZK-1: kolona `linkedArticleId TEXT REFERENCES knowledgeBaseArticles(id) ON DELETE SET NULL` + `idx_cards_linkedArticleId`. Numbered migracija (ne heal) da dosegne postojeće v17 korisnike; pure DDL bez backfilla. Fresh install dobija kolonu iz `clean-schema-addon.sql` i preskače numbered migracije. `TARGET_USER_VERSION = 18`. |

---

## Faza 9 — Worker audit (TD-ARCH-9) ✅

**Problem:** Analytics worker duplicira `_pure` module; fallback već radi na main threadu.

**Implementirano (2026-06-22):**
- Profiling: `buildChartBundle` @ 20k kartica ~120ms, `calcResistance` ~28ms (main thread)
- Uklonjen `src/workers/analytics.worker.ts` + Comlink wiring
- Novi `analyticsClient.ts` — direktni pozivi `_pure` modula
- `useStatsData` / `ResistanceTab` → `useDeferredCompute` (idle slot, umjesto workera)
- `workerClient.ts` / `useAnalyticsWorker.ts` → deprecated re-export barreli
- DOCX worker ne diran (I/O bound)

### DoD
- [x] Benchmark test (`analytics-main-thread-bench.test.ts`)
- [x] Worker uklonjen, UI defer preko `useDeferredCompute`
- [x] Smoke testovi ažurirani

---

## Faza 10 — Cleanup & verification (TD-ARCH-10)

**Cilj:** Zatvoriti tranzicijske slojeve iz Faza 1–9 i potvrditi da je refaktor stvarno „merge-ready“ — bez promjene runtime ponašanja.

**Prioritet (redoslijed rada):**

| # | Stavka | SP | Rizik | Zašto prvo |
|---|--------|-----|-------|------------|
| **P0** | **Zelen test suite + CI** | 2 | nizak | Gate prije brisanja fajlova. Pokreni `npm test --run`, `npm run test:ci`, `npx tsc --noEmit`. Poznati padovi za popravku: `boot-dag-cards.test.ts` (mockovi vs novi `boot()`), `categories-cache-coordinator.test.ts` (očekivanje bez `invalidateQueries`), `perf/cards-query-bench.test.ts` (flaky timing). |
| **P1** | **Migriraj importe → obriši deprecated barrele** | 2 | nizak | Preostali importi na stare path-ove: `cards-cache-coordinator` (npr. `useCardState`, persistence/backup testovi), `categories-cache-coordinator`, `bulk-write-session-depth` (`cards.ts`). Zatim obriši: `cards-cache-coordinator.ts`, `categories-cache-coordinator.ts`, `review-settings-cache-coordinator.ts`, `all-caches-coordinator.ts`, `bulk-write-session-depth.ts`. |
| **P1b** | **Analytics & boot aliasi** | 1 | nizak | Obriši `workerClient.ts`, `useAnalyticsWorker.ts`, `hooks/card-bootstrap/boot-dag.ts`, `card-sections-index.ts` kad nema importa. Testovi → `@/lib/boot/boot`, `@/lib/analytics/analyticsClient`. |
| **P2** | **TD-ARCH-1b — obriši `storage.ts`** | 1 | nizak | Production već bez `@/lib/storage`; prebaci preostale test/mock importe na `@/lib/types/logs`, `@/lib/services/*`, `@/lib/db/queries`. |
| **P3** | **Ručni smoke (desktop)** | 1 | nizak | Cold boot → import backup → category delete → review session → Stats/Planner tab (deferred analytics). |
| **P4** | **Metrike & lockfile** | 1 | nizak | Ažuriraj tablicu metrika (`lib/query/` → 2 modula + `keys`/`client`/invalidation). `npm install` nakon uklanjanja `comlink`. Opciono: ukloni deprecated type alias-e iz `write-session.ts`. |

**Ne ulazi u Fazu 10 (odvojeni backlog):**
- Spajanje `bootStateMachine` + `readyMachine` u jedan modul
- Širi TD-ARCH-8 (saga links, endangered, manje JSON payloada)
- Brisanje `event-bus.ts` (DB UI i dalje zavisi od njega)

### DoD
- [x] `npm test --run` prolazi (`tsc --noEmit` zelen)
- [x] Nema importa na deprecated barrele (`grep` = 0)
- [x] `storage.ts` obrisan
- [x] Playwright smoke spec (`e2e/desktop-smoke-p3.spec.ts`) — 5/5 prolazi
- [x] Checklist [`docs/desktop-smoke-p3.md`](desktop-smoke-p3.md)
- [ ] Ručni Electron smoke (5 koraka u checklisti — korisnik)
- [x] Metrike u ovom dokumentu ažurirane na stvarno stanje

---

## Redoslijed implementacije (preporuka)

```
Sprint 1:  Faza 1 ✅ + Faza 2 (write path)
Sprint 2:  Faza 3 (direct invalidation)
Sprint 3:  Faza 4 (write session)
Sprint 4:  Faza 5 + Faza 6 (event bus + boot)
Sprint 5:  Faza 7 (migracije)
Sprint 6:  Faza 8–9 (schema + worker)
Final:     Faza 10 (cleanup & verification) ✅
```

---

## Metrike uspjeha

| Metrika | Trenutno (procjena) | Cilj |
|---------|---------------------|------|
| Fajlova u `lib/query/` cache sloju | 13 (2 core + invalidation + helpers) | 2 (+ `keys`, `client`, invalidation) |
| Importa `@/lib/storage` | 0 | 0 |
| `emitDomainChanged` call site-ova | 0 | 0 |
| Boot FSM modula | 3 | 1 |
| Card write entry points | 1 | 1 |
| Migration heal koraka na fresh install | ~8 | 0 |

---

## Brza provjera nakon svake faze

```bash
cd memoria-mne
npm test -- --run
npx tsc --noEmit
```

Za Faze 4–7 dodatno:

```bash
npm run test:ci
# Ručno: cold boot, import backup, category delete, review session
```
