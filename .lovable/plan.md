## Backup/Restore Hardening — Phase 4 Implementation Plan

Proceeds in the approved order: **2.1 → 3.x → 1.3 → 1.1 → 4.1 → polish**. Every phase is independently shippable and behind a clear rollback boundary.

---

### Phase 2.1 — Referential Integrity (FK remap on `overwrite`)

**Problem:** When `strategy === "overwrite"` the import currently `db.categories.clear()` + `bulkPut(parsed.categories)` without an ID-remap pass. If the backup file was generated with regenerated UUIDs (legacy export, cross-device merge, manual edit), satellite tables (`sources`, `mindMaps`, `mnemonics`, `knowledgeBaseArticles`, cards) keep their *original* `categoryId` while the categories table is repopulated with potentially *different* IDs → orphans.

**Fix in `src/hooks/useCardImport.ts`:**

1. Extract the existing remap logic (currently only in the non-overwrite branch, lines 165–209) into a pure helper `buildCategoryIdRemap(parsedCats, existingCats): Map<string,string>` colocated at the top of the file.
2. For the `overwrite` branch, run a **pre-write sweep**:
   - Read existing categories first.
   - Build remap (by lowercased name).
   - Apply remap to `merged`, `nextMap`, `parsed.sources`, `parsed.mnemonics`, `parsed.mindMaps`, `parsed.knowledgeBaseArticles`, `parsed.diary` (if it has a categoryId field — verify in `db-schema.ts`).
   - Then `clear()` + `bulkPut(parsed.categories)`.
3. Add an FK **integrity sweep** at the end of the categories block: drop any satellite rows whose `categoryId` no longer exists in the imported set (only when `strategy === "overwrite"`, since other strategies preserve user data).

**Files:** `src/hooks/useCardImport.ts` only.

---

### Phase 3.x — OOM Hardening

**3a. Move `JSON.parse` of large backups to the existing zip worker.**

`src/hooks/useCardImport.ts` line 90 currently does `JSON.parse(jsonText)` on the main thread for the entire payload — blocks UI for ~1.5–3s on 100MB JSON.

- Extend `src/workers/zip-worker.ts` with a third action `"parseJson"` that takes an `ArrayBuffer` (the file bytes), `TextDecoder`-decodes, `JSON.parse`-s, and returns the parsed object as a **structured-cloneable** value.
- Extend `src/lib/zip-service.ts` with `parseJsonInWorker(file: Blob): Promise<unknown>`. Reuses the existing long-lived worker, idle-teardown, and main-thread fallback.
- In `useCardImport.ts`, replace the `JSON.parse(jsonText)` step with `await parseJsonInWorker(file)`. For `.zip` files, decompress to a Blob first and parse in-worker (extend `decompressJsonFromZip` to optionally return the parsed object directly to skip the extra string materialization).

**3b. Binary IPC (drop the 50MB cap).**

`main.cjs` `save-file` / `read-file` go through base64 (≈+33% size) → caps Electron exports at ~50MB.

- Add `save-file-bytes` and `read-file-bytes` IPC handlers in `main.cjs` that accept/return `Uint8Array` (Electron's IPC supports `Buffer` natively over MessagePort).
- Mirror the existing path validation, raise size cap to 500MB.
- Expose `saveFileBytes` / `readFileBytes` in `preload.cjs` and `src/types/electron.d.ts`.
- In `src/hooks/useCardExport.ts`, prefer `electronAPI.saveFileBytes` when present (send `new Uint8Array(await blob.arrayBuffer())`); fall back to base64 path if absent. Remove the `IPC_SIZE_LIMIT_MB = 50` hard-throw when bytes API is available.
- Same swap in any read path that hits the cap (`useCardImport` doesn't currently use IPC read for imports — file picker passes a `File`, so no change needed there).

---

### Phase 1.3 — Single Atomic Import Transaction

**Problem:** `useCardImport.ts` currently uses *three* separate `db.transaction` blocks (cards/categories overwrite, reviewLog overwrite, sources/mindMaps/KB, satellite logs). A failure in tx #3 leaves tx #1 and #2 already committed → "half-replaced" DB.

**Fix:**

1. Create `src/lib/backup/import-transaction.ts` exporting `applyImportAtomically(parsed, strategy, ctx)` that wraps **every IDB write** in a single `db.transaction("rw", [...allTables], async () => { ... })`.
2. Move the body of the import (categories, cards bulkPut via direct `db.cards.bulkPut`, reviewLog, sources, mindMaps, KB, satellite logs, settings) into that helper.
3. Replace `schedulePersist`/`persistQueue.flush()` for the import path with a direct `db.cards.bulkPut(merged)` *inside* the atomic transaction. After the transaction commits, sync the in-memory `cardMapRef` and call `bumpMapVersion()`. Rationale: import is a one-shot bulk operation; the persist-queue is for steady-state edits and its async drain is what causes the current race.
4. Keep the legacy taxonomy resolve (`resolveLegacyTaxonomyNames`) inside the transaction so that if it throws, nothing commits.
5. `useCardImport.ts` becomes a thin orchestrator: parse → migrate → `applyImportAtomically` → in-memory sync → toast.

**Failure semantics after this phase:** any thrown error rolls IDB back to the pre-import snapshot. The toast becomes truthful.

---

### Phase 1.1 — UI Yield in Long Loops

**Problem:** `BackupSchema.safeParse` and the legacy `resolveLegacyTaxonomyNames` are O(N) on the cards array; on 50k cards they block paint for 400–800ms while the progress bar is frozen at "Validacija šeme…" / "Priprema podataka…".

**Fix:**

1. Inside `applyImportAtomically`'s pre-loop normalization (e.g. the per-card remap loops at lines 182–209), insert `await yieldUI()` every 1000 records.
2. For Zod validation specifically: Zod `safeParse` is synchronous and can't be split. Instead, in `useCardImport.ts`, **wrap the `safeParse` call in a `await yieldUI()` immediately before** so the "Validacija šeme…" progress paints, and add a second `yieldUI` immediately after. (Real chunked validation would require schema rework — out of scope; the paint flush is the cheap win.)
3. In `ExportImportDialog.tsx`, the import-validation step (file pre-scan around line 80) currently sets a single 20% progress; thread the same `onProgress` callback into the validator so the bar advances during the parse.

---

### Phase 4.1 — Migrate-before-Validate

**Problem:** `BackupSchema.safeParse` runs *before* `migrateBackup`. Old-shape backups (e.g. v5 lacking `settings`, v6 lacking `knowledgeBaseArticles`) **fail Zod validation** before they ever reach the migration ladder that would have added the defaults.

**Fix in `src/hooks/useCardImport.ts`:**

1. Add a thin `migrateRaw(raw: unknown): unknown` step in `src/lib/backup/migrate.ts` that operates on the *pre-Zod* shape: reads `raw.version`, applies the same numeric ladder, but only injects missing-array defaults (`settings`, `knowledgeBaseArticles`) — does not touch already-present fields.
2. Reorder in `useCardImport.ts`:
   - `JSON.parse` (now in worker, Phase 3a)
   - `migrateRaw(raw)`
   - `BackupSchema.safeParse(migratedRaw)`
   - `migrateBackup(parsed)` (existing post-Zod ladder, idempotent on already-migrated input)
3. Add a unit test in `src/test/backup-schema.test.ts` covering `migrateRaw` for v5 and v6 fixtures.

---

### Polish

1. **`RemapFromBackupDialog.tsx`** uses the legacy main-thread `await file.text()` + `JSON.parse` + `JSZip.loadAsync` pipeline. Switch to `parseJsonInWorker` / `decompressJsonFromZip` from `zip-service.ts` for consistency and to remove the duplicated JSZip import (already cached in zip-service).
2. **`useCardExport.ts` `exportTemplate`** still does `await db.categories.orderBy("sortOrder").toArray()` outside any transaction; wrap in the same `db.transaction("r", ...)` snapshot pattern as `exportData`.
3. **Memory file:** update `mem://features/backup-restore-hardening.md` to record: atomic single-tx import, FK sweep on overwrite, worker JSON parse, binary IPC, migrate-before-validate. Bump the listed `BACKUP_SCHEMA_VERSION` if any new field is added (no schema bump in this phase).
4. **Tests:** extend `src/test/backup-schema.test.ts` with a round-trip test (export-stream → parseJsonInWorker → migrateRaw → BackupSchema → migrateBackup → applyImportAtomically) over a small in-memory Dexie instance to lock in the ordering contract.

---

### Files touched (summary)

- `src/hooks/useCardImport.ts` — major refactor (orchestrator)
- `src/hooks/useCardExport.ts` — binary IPC swap, template tx
- `src/lib/backup/import-transaction.ts` — **new**, single-tx body
- `src/lib/backup/migrate.ts` — add `migrateRaw`
- `src/lib/zip-service.ts` — add `parseJsonInWorker`
- `src/workers/zip-worker.ts` — add `parseJson` action
- `main.cjs`, `preload.cjs`, `src/types/electron.d.ts` — `*-bytes` IPC
- `src/components/ExportImportDialog.tsx` — thread progress through validation
- `src/components/RemapFromBackupDialog.tsx` — use shared zip-service
- `src/test/backup-schema.test.ts` — new round-trip + migrateRaw tests
- `mem://features/backup-restore-hardening.md` — update
