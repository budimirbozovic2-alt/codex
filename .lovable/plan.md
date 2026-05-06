## Phase 5 + 4.2 — Cooperative Yielding & Schema Version UX

Završetak audit roadmape: dodatni yield-ovi u dugim sinhronim petljama (5.1, 5.2) i transparentno prikazivanje verzije backup šeme u import flow-u (4.2).

---

### Phase 5.1 — Yield u validacijskoj petlji (`ExportImportDialog.tsx`)

**Problem:** Trenutna validacija (linije 92–193) prolazi kroz `importedCards` u jednom sinhronom `for` loop-u. Na 50k+ kartica ovo blokira paint 200–500ms iako je `setProgress(70)` već postavljen — progres bar zaledi.

**Fix:**
- Uvesti `await yieldUI()` svakih 1000 iteracija unutar:
  - `for (let i=0; i < importedCards.length; i++)` (cards UUID + sections check)
  - `for (let i=0; i < parsed.sources.length; i++)`
  - FK check petlje (`importedCards` i `parsed.sources` protiv `validCategoryIds`)
- Promijeniti progress poruku unutar petlji da odražava realan napredak (`Validacija ${i}/${total}`).
- Zamijeniti `await new Promise((r) => setTimeout(r, 0))` sa shared `yieldUI()` iz `@/lib/backup/yield-ui` zbog konzistentnosti (koristi `scheduler.yield()` kad je dostupno).

**Fajlovi:** `src/components/ExportImportDialog.tsx`.

---

### Phase 5.2 — Yield + napredak u remap dialog-u (`RemapFromBackupDialog.tsx`)

**Problem:** `handleFile` poziva `parseJsonInWorker` (off-thread, OK) ali zatim `remapFromBackup(json, { dryRun: true })` koji je sinhron O(N) po karticama. Nema progresa, nema yield-a — UI pokazuje samo statički "Analiziram backup…".

**Fix:**
- Prije `remapFromBackup` poziva: `await yieldUI()` da paint flush-uje "Analiziram backup…".
- Provjeriti potpis `remapFromBackup` u `src/lib/migrations/remap-from-backup.ts`: ako prima `onProgress`, proslijediti ga; ako ne, dodati opcionalni `onProgress?: (pct, msg) => void` callback i unutar njegove glavne `for` petlje yield-ovati svakih 1000 kartica.
- Dodati `progress` state (0–100) u dialog i `<Progress />` bar u "parsing" / "applying" fazama umjesto samog `Loader2`.

**Fajlovi:** `src/components/RemapFromBackupDialog.tsx`, `src/lib/migrations/remap-from-backup.ts` (proširiti potpis sa optional `onProgress`).

---

### Phase 4.2 — UI prikaz verzije backup šeme

**Problem:** Korisnik ne vidi koja je verzija backupa u fajlu, ni koja je trenutna app verzija. Kada `migrateRaw` baci `BackupVersionError`, samo dobija toast — bez konteksta u dialog-u. Nadogradnje šeme su za njega "crna kutija".

**Fix u `ExportImportDialog.tsx`:**

1. **Validation phase** — uhvatiti `parsed.version` (number) tokom postojećeg validation passa i staviti u `ImportValidation`:
   ```ts
   interface ImportValidation {
     ...
     fileVersion: number | null;   // npr. 5
     appVersion: number;           // BACKUP_SCHEMA_VERSION = 7
     willMigrate: boolean;         // fileVersion < appVersion
   }
   ```
2. **Confirm screen** — u summary grid dodati red:
   - "Verzija fajla: v5 → v7 (auto-migracija)" sa `Wand2` ikonom kad `willMigrate === true`
   - "Verzija fajla: v7 (najnovija)" sa `ShieldCheck` kad jednake
   - Crveni alert sa `BackupVersionError` porukom kad `fileVersion > appVersion` (validation `valid: false`)
3. **Pre-validation guard** — prije Zod validacije pozvati `migrateRaw` (već postoji u `useCardImport`, ali validacija u dialog-u radi prije import-a). Importovati `migrateRaw` i `BACKUP_SCHEMA_VERSION` iz `@/lib/backup/migrate` u dialog i pozvati ga odmah nakon `parseJsonInWorker`. Hvatati `BackupVersionError` i postaviti structured error sa verzijama u `validation.errors` umjesto generičnog stringa.

**Fajlovi:** `src/components/ExportImportDialog.tsx`.

---

### Yield konsolidacija (cleanup)

Zamijeniti sve `await new Promise(r => setTimeout(r, 0))` u backup pipeline-u sa `yieldUI()`:
- `src/components/ExportImportDialog.tsx` linija 91
- (Provjera ostalih backup-related fajlova preko `rg`.)

Razlog: jedinstven scheduler hook, lakše je kasnije zamijeniti implementaciju (npr. `requestIdleCallback` fallback).

---

### Test pokrivenost

Proširiti `src/test/backup-schema.test.ts` sa:
- `migrateRaw` za v5 (no `settings`) → injects `[]`
- `migrateRaw` za v6 (no `knowledgeBaseArticles`) → injects `[]`
- `migrateRaw` baca `BackupVersionError` za v999
- `migrateRaw` idempotent: dva uzastopna poziva daju isti output

---

### Files touched

- `src/components/ExportImportDialog.tsx` — yield petlje, version display, pre-validation `migrateRaw`
- `src/components/RemapFromBackupDialog.tsx` — progress bar, yield prije `remapFromBackup`
- `src/lib/migrations/remap-from-backup.ts` — opcionalni `onProgress` + interni yield
- `src/test/backup-schema.test.ts` — `migrateRaw` testovi

Bez izmjena na `db-schema.ts`, IPC layeru, ili worker fajlovima.
