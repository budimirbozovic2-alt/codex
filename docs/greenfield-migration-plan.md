# Greenfield migracija — plan razvoja (strangler fig)

Datum početka: 2026-06-23  
Referenca: arhitekturna analiza (jun 2026), [`architecture-refactoring-plan.md`](architecture-refactoring-plan.md) (TD-ARCH 1–10 ✅)  
Evidencija novog tehničkog duga: [`greenfield-migration-debt.md`](greenfield-migration-debt.md)

**Cilj:** Postepeno približiti aplikaciju greenfield arhitekturi — relacioni data model, IPC commands, feature sliceovi, eliminacija cache-coordinator sloja — bez big-bang rewrite-a.

---

## Ciljno stanje

```
features/<domen>/
  api/          hooks + TanStack query/mutation
  components/
  types.ts

Main process:
  CardService, CategoryService, …  (commands, ne raw SQL)

Renderer:
  React → TanStack Query (jedini read cache)
       → ipc.invoke('db:…')  (DTO in/out)
       → invalidateQueries u onSettled

SQLite (main):
  Relacioni model — bez JSON payload duplikata za cards
```

---

## Baseline metrike (Wave 0 — 2026-06-23)

| Metrika | Vrijednost |
|---------|------------|
| `tsc --noEmit` | ✅ zelen |
| `npm test --run` | ✅ 1130/1130 (3 uzastopna zelena runa) |
| `cache-coordinator.ts` LOC | 337 |
| `write-session.ts` LOC | 240 |
| `authoritative-write.ts` LOC | 52 |
| `lib/query/` fajlova | 13 |
| Importa `@/lib/db/queries` | 108 |
| Importa `@/lib/repositories` | 41 |
| Importa `cache-coordinator` | 39 |
| Importa `write-session` | 15 |
| Izvornih fajlova (`src/`) | ~910 |
| Test fajlova | 210 |
| Hook fajlova | 93 |
| DB migracija verzija | v17 |

---

## Talasi — pregled

| Wave | Naziv | SP | Rizik | Prioritet | Status |
|------|-------|-----|-------|-----------|--------|
| **0** | CI gate + baseline | 2 | nizak | P0 | ✅ Done (2026-06-23) |
| **1** | Cache sloj → čisti TanStack | 21 | srednji | **P1** | ⏳ Sljedeće |
| **2** | Feature slice pilot | 8 | nizak | P2 | 🔲 |
| **3** | IPC commands (cards) | 34 | visok | **P1** | 🔲 |
| **3b** | IPC commands (sateliti) | 21 | srednji | P2 | 🔲 |
| **4** | Relacioni card model (v18) | 34 | vrlo visok | **P3** | 🔲 |
| **4b** | Log tabele + categories payload | 13 | srednji | P4 | 🔲 |
| **5** | Cleanup + sqlite-rpc uklanjanje | 8 | srednji | P5 | 🔲 |

**Ukupno:** ~141 SP (~7–9 sprintova od 2 sedmice).

### Zavisnosti

```
Wave 0 → Wave 1 → Wave 3 → Wave 4
              ↘ Wave 2 (paralelno)
```

---

## Wave 0 — CI gate ✅ (2026-06-23)

**Cilj:** Stabilna osnova prije strukturnih promjena.

### Urađeno

| Stavka | Status |
|--------|--------|
| `npx tsc --noEmit` | ✅ |
| `npm test --run` × 3 uzastopno | ✅ 1130/1130 |
| Baseline metrike snimljene | ✅ (tablica gore) |
| Plan dokumentovan | ✅ ovaj fajl |
| Evidencija GF duga | ✅ [`greenfield-migration-debt.md`](greenfield-migration-debt.md) |
| Test stabilizacija (DOMPurify mock, DOM shim, factories) | ✅ vidi GF-DEBT-0 |

### DoD

- [x] Tri uzastopna zelena `npm test --run`
- [x] `tsc --noEmit` zelen
- [x] Baseline metrike u planu
- [x] Dokumentacija plana + debt log

---

## Wave 1 — Eliminacija cache-coordinator sloja (P1)

**Problem:** `cache-coordinator` + `write-session` + `authoritative-write` (~630 LOC) — generation guards, authoritative re-read, bulk depth.

**Cilj:** Samo TanStack Query; `invalidateQueries` / `prefetchQuery` u repository `onSettled`.

| Podfaza | Tiket | SP | Status |
|---------|-------|-----|--------|
| 1a | Boot `seedAllQueryCaches` → `prefetchQuery` | 3 | 🔲 |
| 1b | Repository `onSettled` invalidation (cards, categories) | 5 | 🔲 |
| 1c | Bulk import: `cancelQueries` + work + jedna `invalidateQueries` | 5 | 🔲 |
| 1d | Ukloniti generation guards + `authoritative-write.ts` | 3 | 🔲 |
| 1e | Obrisati `cache-coordinator.ts`, `write-session.ts` (grep = 0) | 2 | 🔲 |
| 1f | Contract testovi (boot, bulk, persistence) | 3 | 🔲 |

**DoD:** grep `cache-coordinator|write-session|authoritative-write` = 0 u production; contract testovi zeleni.

---

## Wave 2 — Feature slice organizacija (P2, paralelno)

**Ciljna struktura:** `src/features/<domen>/{api,components,types.ts}` + `src/shared/{ui,lib}`.

| Podfaza | Tiket | SP | Status |
|---------|-------|-----|--------|
| 2a | Konvencija + `features/review/` pilot | 5 | 🔲 |
| 2b | `backup`, `settings` | 3 | 🔲 |
| 2c | `planner`, `stats` | 5 | 🔲 |
| 2d | `cards` (posljednji — najveći) | 8 | 🔲 |

**DoD:** ≥1 feature modul bez deprecated re-exporta; konvencija dokumentovana.

---

## Wave 3 — IPC commands (P1)

**Problem:** Renderer šalje raw SQL preko `sqlite-rpc` — svaki upit = IPC hop.

**Cilj:** Main-process `*Service` + typed `ipc.invoke('db:cards:list', dto)`.

| Podfaza | Tiket | SP | Status |
|---------|-------|-----|--------|
| 3a | `electron/services/` + command registry + Zod | 5 | 🔲 |
| 3b | Preload `dbInvoke(cmd, args)` | 3 | 🔲 |
| 3c | Cards reads u main | 8 | 🔲 |
| 3d | Cards writes u main (grade, patch, bulk) | 13 | 🔲 |
| 3e | Renderer `cardRepository` → IPC client; feature flag | 5 | 🔲 |
| 3f | Contract testovi (harness parity) | 3 | 🔲 |

### Wave 3b — sateliti

| Domen | SP | Prioritet | Status |
|-------|-----|-----------|--------|
| categories + taxonomy | 5 | visok | 🔲 |
| reviewLog + settings | 5 | visok | 🔲 |
| backup import/export | 8 | visok | 🔲 |
| sources, mindmaps, kb | 5 | srednji | 🔲 |
| logs (8 tabela) | 8 | nizak | 🔲 |
| mnemonics, drafts, planner kv | 5 | nizak | 🔲 |

**DoD:** Cards path bez `sqlite-rpc` u rendereru; rollback flag radi.

---

## Wave 4 — Relacioni card model (P3)

**Problem:** JSON `payload` + denorm kolone + `card_sections` sync.

**Cilj:** `cards` meta kolone + `card_sections` (FSRS SSOT) + `card_content` (EditorDoc, tags, …).

| Podfaza | Tiket | SP | Status |
|---------|-------|-----|--------|
| 4a | v18 schema dizajn + `assembleCard()` codec | 5 | 🔲 |
| 4b | Dual-write (payload + nove tabele) | 8 | 🔲 |
| 4c | Dual-read + feature flag | 8 | 🔲 |
| 4d | Migracija v18 za postojeće DB | 8 | 🔲 |
| 4e | Cutover read | 3 | 🔲 |
| 4f | Ukloniti `payload` kolonu (v19) | 5 | 🔲 |

**Preduslov:** Wave 3d (CardService u main).

---

## Wave 5 — Final cleanup (P5)

- Ukloniti `sqlite-rpc`, `main-ipc-client.ts`
- Obrisati deprecated re-export barrele
- `knip` dead code pass
- Ažurirati ovaj plan → arhitektura „done“

---

## Redoslijed sprintova

```
Sprint 1:  Wave 0 ✅ + Wave 1a–1b
Sprint 2:  Wave 1c–1f ‖ Wave 2a (review pilot)
Sprint 3:  Wave 3a–3c
Sprint 4:  Wave 3d–3e
Sprint 5:  Wave 3b (categories, review, settings)
Sprint 6:  Wave 4a–4c
Sprint 7:  Wave 4d–4f
Sprint 8:  Wave 3b ostatak + Wave 2d + Wave 5
```

---

## Metrike uspjeha (kraj programa)

| Metrika | Baseline (W0) | Cilj |
|---------|---------------|------|
| Cache infrastruktura LOC | ~630 | 0 |
| `sqlite-rpc` iz renderer production koda | svi upiti | 0 |
| `cards.payload` | pun JSON | uklonjeno |
| Card write u main | 0 | 1 (`CardService`) |
| Feature moduli u `features/` | 0 | ≥6 |
| `lib/query/` LOC | ~13 fajlova | <300 |

---

## Brza provjera nakon svake podfaze

```bash
cd memoria-mne
npm test -- --run
npx tsc --noEmit
```

Za Wave 3+ dodatno:

```bash
npm run test:ci
# Ručno: cold boot, import backup, review session
```

Za svaku završenu podfazu: ažuriraj status tablicu u ovom dokumentu i zabilježi novi dug u [`greenfield-migration-debt.md`](greenfield-migration-debt.md).
