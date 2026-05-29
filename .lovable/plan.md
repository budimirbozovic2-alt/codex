
# Mini-audit: Sync SQL na main thread-u + chunked streaming plan

## Kontekst

OPFS-SAH-pool VFS radi u **renderer (main) thread-u** — nema `postMessage`/structured-clone overhead-a (nema klasičnog Mammoth problema), ali **svaki `exec.all()` blokira UI** dok wasm SQLite čita stranice. Bez mjerenja ne znamo koji pozivi prelaze 16ms budget za frame.

## Sumnjivih 5 poziva (kandidati za mjerenje)

Identifikovano grep-om kroz `src/lib/db/queries/*`:

| # | Poziv | Lokacija | Tipičan call site | Procjenjeni rizik |
|---|---|---|---|---|
| 1 | `listAllCards()` | `cards.ts:105` `SELECT payload FROM cards` | `loadCardsDeferred` (boot heal), `readAllCardsForBackup` | **VISOK** — 10k–20k redova, JSON.parse svake | 
| 2 | `listCardsByCategory(id)` | `cards.ts:115` indeksiran `WHERE categoryId=?` | TanStack `useCardsByCategory` na svakom subject switch-u | **SREDNJI** — 500–3000 redova |
| 3 | `listAllReviewLog()` / `listAllLog<T>` | `logs.ts:83/165/265/277` | Backup, analytics worker hidracija, stats | **VISOK** — može preći 50k entry-ja |
| 4 | `listAllSources()` / `listAllMindMaps()` | `sources.ts:95`, `mind-maps.ts:59` | Backup, health monitor, zettelkasten boot | **SREDNJI** — payload-i krupni (HTML/mind-map JSON) |
| 5 | `listAllArticles()` (Zettelkasten) | `knowledge-base.ts:80` | `useZettelkastenBootstrap` na ulazu u Zettel view | **SREDNJI/VISOK** — articles imaju veliki HTML payload |

## Pristup (3 faze, **measure-first, optimize-second**)

### Faza A — Telemetrija (0.5 dana)

1. Dodati `src/lib/db/queries/_shared/sql-timing.ts`:
   - `withSqlTiming(label, fn)` wrapper: `performance.mark(`sql:${label}:start`)`, izvrši, `performance.measure`, `performance.mark(`sql:${label}:end`)`.
   - Module-level histogram (count, sum, p50, p95, max) po label-u.
   - DevTools handle `window.__codex_sqlTimings` (pattern iz `executor-telemetry`).
   - Threshold: ako `dur > 16` → `logger.warn` u DEV.
2. Instrumentirati **samo 5 kandidata** + `bulkApply` (već postoji u `opfs-sqlite-adapter`) — 1-line wrap, bez API izmjena.
3. Dodati `src/test/sql-timing.test.ts` (počni/zaustavi, p95 obračun).

### Faza B — Mjerenje (0.25 dana, lokalno, ručno)

User pokrene tipičan flow:
1. Boot (deferred cards load + heal).
2. Subject switch × 3 (cold + warm).
3. Backup export.
4. Otvori Zettelkasten view.
5. Otvori Stats / Analytics.

Snimi `window.__codex_sqlTimings` snapshot u JSON, ubaci u `.lovable/sql-perf-report.json`.

**Odluka gate**:
- Svi p95 < 16ms → **STOP, ne premještaj ništa**, samo zadrži telemetriju u DEV.
- p95 16–50ms → razmotri `requestIdleCallback` chunked yield na main thread-u (jeftino, bez worker-a).
- p95 > 50ms → kandidat za worker offload.

### Faza C — Worker offload (uslovno, 0.75 dana, samo za dokazano teške)

Samo za pozive koji prelaze gate. Strategija:

1. **Novi worker** `src/workers/sqlite-read.worker.ts` — drži *vlastiti* SQLite handle preko `kSahPoolUtil`-a otvorenog u **read-only modu** (`SQLITE_OPEN_READONLY`) na isti OPFS direktorij. WAL omogućava paralelne read-ove dok writer ostaje na main thread-u (jedan writer pravilo SQLite-a se poštuje).
2. **Chunked streaming protokol**:
   ```
   main → worker: { type: "query", id, sql, params, chunkSize: 500 }
   worker → main: { type: "chunk", id, rows: [...500] }   // ponavljano
   worker → main: { type: "done", id }
   ```
   Worker u petlji `LIMIT 500 OFFSET k` (ili keyset paginacija po `rowid`) i `postMessage` nakon svake stranice — main thread spaja u TanStack cache **inkrementalno** uz `keepPreviousData`.
3. **Read seam** `src/lib/db/queries/_shared/stream-reader.ts`:
   - `streamAll<T>(label, sql, params, onChunk)` — wrap oko worker RPC-a.
   - Fallback: ako worker nije dostupan (test env), poziva direktno `exec.all` — kontrakt ostaje identičan.
4. Migrirati **samo dokazane teške** pozive (vjerovatno: `listAllCards`, `listAllReviewLog`, `readAllArticlesForBackup`). Ostali ostaju sync.
5. Bridge: `notifyCardsChanged()` itd. trigger-uje worker `pragma wal_checkpoint(PASSIVE)` da reader vidi nove podatke (alternativa: reader otvara konekciju per-query).

### Faza D — Verifikacija (0.25 dana)

- Re-run mjerenja iz Faze B sa migriranim pozivima → uporedi p95 prije/poslije, upiši delta u `.lovable/sql-perf-report.json`.
- Acceptance: nijedan instrumentirani poziv ne smije imati **single contiguous main-thread block > 16ms**.
- Testovi: `sql-timing.test.ts`, novi `stream-reader.test.ts` (mock worker, verifikuj chunk ordering + final assembly), postojeći `opfs-sqlite-adapter.test.ts` ostaje zelen.
- `tsc --noEmit` clean.

## Tehnički detalji

**Zašto ne premještati sve odmah**: Worker SQLite reader zahtjeva drugu konekciju na isti OPFS file — sa SAH pool VFS-om to znači dodatni file lock slot i konfiguraciju. Cijena nije besplatna. **Ne plaćaj cijenu prije dokaza**.

**Zašto chunked yield** (a ne čist offload): UI ne mora čekati cijeli rezultat — TanStack može renderovati listu inkrementalno sa `placeholderData: keepPreviousData` (već urađeno u prethodnom phase-u za sources/cards/mnemonics/KB). Streaming = brži first-paint čak i kad je ukupno vrijeme isto.

**Šta NIJE u scope-u**:
- Selectivno kolone (`SELECT id, categoryId` umjesto `SELECT payload`) — odvojen optimization (codec rewrite).
- Per-row JSON.parse u worker-u — može u sljedećoj iteraciji.
- Promjena WAL/checkpoint politike.
- Nove TanStack queryKeys.

## Estimat

- Faza A: 0.5 dana
- Faza B: 0.25 dana (user-driven)
- Faza C: 0.75 dana (uslovno, vjerovatno 1–2 poziva)
- Faza D: 0.25 dana
- **Ukupno: 1.25–1.75 dana**, sa jasnim go/no-go gate-om poslije Faze B.

## Files koji bi se mijenjali

- **Faza A (sigurno)**: `src/lib/db/queries/_shared/sql-timing.ts` (novo), `cards.ts`, `logs.ts`, `sources.ts`, `mind-maps.ts`, `knowledge-base.ts` (po 1 wrap line), `src/test/sql-timing.test.ts` (novo).
- **Faza C (uslovno)**: `src/workers/sqlite-read.worker.ts` (novo), `src/lib/db/queries/_shared/stream-reader.ts` (novo), 1–2 queries fajla migrirana na `streamAll`, `vite.config.ts` (worker entry ako treba).
