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
| **1** | Foundation cleanup | 3 | nizak | Uklanjanje legacy facades, tipovi, komentari | 🔄 U toku |
| **2** | Write path unifikacija | 8 | srednji | 3 card write path-a → 1 repository | ⏳ TD-ARCH-2 |
| **3** | Direct invalidation | 13 | srednji | Event bus ostaje, ali repositories invalidiraju direktno | ⏳ TD-ARCH-3 |
| **4** | Cache coordinator collapse | 13 | srednji–visok | 4 koordinatora → 1 `writeSession` | ⏳ TD-ARCH-4 |
| **5** | Event bus uklanjanje | 8 | visok | bridges.ts → ukloniti kad F3+F4 završene | ⏳ TD-ARCH-5 |
| **6** | Boot simplification | 8 | srednji | boot DAG + 3 FSM → 1 boot flow | ⏳ TD-ARCH-6 |
| **7** | Migration consolidation | 13 | visok | 16 verzija + heal chain → 3–4 eksplicitna koraka | ⏳ TD-ARCH-7 |
| **8** | Schema normalizacija | 21 | visok | JSON card payload + denorm indeksi → relacione FSRS sekcije | ⏳ TD-ARCH-8 |
| **9** | Worker audit | 3 | nizak | Analytics worker samo ako profiling pokaže potrebu | ⏳ TD-ARCH-9 |

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

## Faza 2 — Write path unifikacija (TD-ARCH-2)

**Problem:** Tri ulazna mjesta za card persistence:
- `lib/db/queries/cards.ts` — reads + neki writes
- `lib/repositories/cardRepository.ts` — primary writes
- `lib/db/queries/cards-writes.ts` — field-level SQL patches

**Predlog:**
1. `cardRepository.ts` postaje jedini public write API za kartice
2. `cards-writes.ts` postaje internal (`_cards-writes.ts` ili private modul)
3. `cards.ts` queries ostaju read-only (+ agregati)
4. ESLint rule: UI/hooks smiju importovati samo `cardRepository` za writes

**Fajlovi:**
- `src/lib/repositories/cardRepository.ts`
- `src/lib/db/queries/cards.ts`
- `src/lib/db/queries/cards-writes.ts`
- `src/hooks/card/useCardMutations.ts`
- `src/test/card-repository*.test.ts`

**DoD:**
- Jedan import path za card writes u cijelom `src/`
- Postojeći contract testovi prolaze
- Nema regresije u optimistic mutations

**Rizik:** srednji — mnogo call site-ova, ali behavior se ne mijenja.

---

## Faza 3 — Direct invalidation (TD-ARCH-3)

**Problem:** Write → event bus → bridges (debounce 16ms/250ms) → TanStack. Nepotreban indirektni sloj.

**Predlog (inkrementalno, bez uklanjanja event bus-a odmah):**
1. `cardRepository` na kraju write operacije poziva `queryClient.invalidateQueries` direktno
2. bridges.ts ignoriše evente koje je repository već invalidirao (dedup flag)
3. Postepeno premjestiti invalidaciju u repositories za categories, review settings, planner
4. Event bus ostaje za cross-domain notifikacije (mindmaps, mnemonics) dok Faza 5 ne završi

**Fajlovi:**
- `src/lib/repositories/*.ts`
- `src/lib/query/bridges.ts`
- `src/lib/event-bus.ts`

**DoD:**
- Single-card write ne prolazi kroz debounced bridge cycle
- bridges.test.ts ažuriran
- Metrike `_cycleEmits` opadaju za >80% na tipičnom edit flow-u

**Rizik:** srednji — dupla invalidacija može uzrokovati flicker ako se ne deduplicira.

---

## Faza 4 — Cache coordinator collapse (TD-ARCH-4)

**Problem:** 4 paralelna koordinatora + `all-caches-coordinator` sa generation guards, bulk-write depth, satellite sync modovima.

**Predlog:**
```typescript
// lib/query/write-session.ts
export async function runWriteSession<T>(
  scope: WriteScope,
  fn: () => Promise<T>,
): Promise<T> {
  enterBulkWriteWork();
  const gen = beginWrite(scope);
  try {
    const result = await fn();
    await commitFromDb(scope, gen);
    return result;
  } catch (e) {
    abortWrite(scope, gen);
    throw e;
  } finally {
    exitBulkWriteWork();
  }
}
```

**Migracija:**
1. Implementirati `write-session.ts` kao wrapper oko postojećih koordinatora
2. Migrirati import/reset/category-delete na novi API
3. Ukloniti direktne pozive `beginCardsWrite` / `commitCardsWriteFromDb` izvan write-session
4. Spojiti 4 koordinator fajla u 1

**Fajlovi:**
- `src/lib/query/cards-cache-coordinator.ts`
- `src/lib/query/categories-cache-coordinator.ts`
- `src/lib/query/review-settings-cache-coordinator.ts`
- `src/lib/query/all-caches-coordinator.ts`
- `src/lib/query/bulk-write-session-depth.ts`

**DoD:**
- Bulk import i dalje prolazi `import-unified-cache-sync.test.ts`
- Jedan fajl za write session umjesto 4+

**Rizik:** srednji–visok — generation guards su tu iz razloga; treba zadržati invariante iz postojećih testova.

---

## Faza 5 — Event bus uklanjanje (TD-ARCH-5)

**Preduslov:** Faze 3 i 4 završene.

**Predlog:**
1. Ukloniti `emitDomainChanged` iz repositories — samo `invalidateQueries`
2. Ukloniti `bridges.ts` i `onDomainChanged` subscription
3. Domain storage moduli (mindmaps, mnemonics, sources) koriste TanStack query keys umjesto RAM cache + event bus
4. Ukloniti `event-bus.ts` i `event-bus-types.ts`

**DoD:**
- Grep za `emitDomainChanged` = 0 u production kodu
- Boot i dalje radi bez bridge install step-a

**Rizik:** visok — cross-domain sync (npr. category delete → mindmaps) mora biti eksplicitno u orchestratoru.

---

## Faza 6 — Boot simplification (TD-ARCH-6)

**Problem:** `bootStateMachine` + `readyMachine` + `boot-dag` + splash bridge + 22s panic + 3 cache seed koordinatora.

**Predlog:**
```typescript
async function boot(signal: AbortSignal): Promise<void> {
  splashProgress("Opening database…");
  await ensureSqliteReady();
  splashProgress("Applying migrations…");
  await runSchema();
  splashProgress("Loading data…");
  await seedAllQueryCaches(); // jedan poziv
  splashProgress("Ready");
  transition("ready");
}
```

**Fajlovi:**
- `src/hooks/card-bootstrap/boot-dag.ts`
- `src/lib/boot/bootStateMachine.ts`
- `src/lib/persistence/sqlite/readyMachine.ts`
- `src/hooks/useCardBootstrap.ts`

**DoD:**
- `boot-dag.test.ts` i `boot-deferred-cards.test.ts` prolaze
- Boot trace i dalje loguje korake
- Uklonjen panic timer ako FSM ima jasan error path

**Rizik:** srednji — boot je kritičan path; zadržati postojeće testove kao safety net.

---

## Faza 7 — Migration consolidation (TD-ARCH-7)

**Problem:** Verzije 8–19 imaju `SELECT 1` SQL sa TS heal logikom poslije petlje; idempotent heals se pokreću i na fresh DB.

**Predlog:**
1. Zamrznuti trenutne migracije — ne brisati historiju
2. Dodati `migration-runner-v2.ts` za nove instalacije (clean schema + seed)
3. Postojeće baze: jedan `runPostMigrationHeals()` sa jasnim redoslijedom umjesto version-gated `SELECT 1`
4. Dokumentovati šta svaki heal radi i kada je potreban

**DoD:**
- Fresh install: 1 schema apply, 0 heal koraka
- Upgrade sa v16: jasan log koji heal-ovi su se pokrenuli
- Nema `SELECT 1` u novim migracijama

**Rizik:** visok — data loss ako heal redoslijed nije tačan. Obavezno backup-before-migrate test.

---

## Faza 8 — Schema normalizacija (TD-ARCH-8, opciono)

**Problem:** Kartice su JSON payload + denormalizovani `card_sections_index`, saga links, endangered sync — kompleksno održavanje.

**Predlog (dugoročno):**
- Tabele: `card_sections(id, card_id, state, stability, difficulty, next_review, …)`
- Due query = običan SQL INDEX scan
- Ukloniti TS sync logiku za indekse

**Rizik:** visok, veliki SP — samo ako perf postane problem ili schema heal postane neodrživ.

---

## Faza 9 — Worker audit (TD-ARCH-9)

**Problem:** Analytics worker duplicira `_pure` module; fallback već radi na main threadu.

**Predlog:**
1. Profilirati sa 5k/10k/20k kartica
2. Ako main thread < 100ms: ukloniti worker, koristiti `useDeferredValue`
3. DOCX worker zadržati (I/O bound)

**Rizik:** nizak.

---

## Redoslijed implementacije (preporuka)

```
Sprint 1:  Faza 1 ✅ + Faza 2 (write path)
Sprint 2:  Faza 3 (direct invalidation)
Sprint 3:  Faza 4 (write session)
Sprint 4:  Faza 5 + Faza 6 (event bus + boot)
Sprint 5:  Faza 7 (migracije)
Backlog:   Faza 8–9 (product-driven)
```

---

## Metrike uspjeha

| Metrika | Trenutno (procjena) | Cilj |
|---------|---------------------|------|
| Fajlova u `lib/query/` cache sloju | ~12 | ≤4 |
| Importa `@/lib/storage` | 0 (deprecated) | 0 |
| `emitDomainChanged` call site-ova | ~25 | 0 |
| Boot FSM modula | 3 | 1 |
| Card write entry points | 3 | 1 |
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
