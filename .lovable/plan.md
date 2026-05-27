# P3 PR-8 — OPFS SQLite adapter + IDB→SQLite migration (M1+M2+M3+M4 shipped, adapter dormant)

## Shipped scope

M1 infrastructure, M2 one-shot data migration wired into `runSchema` as soft-fail Step 4 (Electron-only), M3 adapter factory, M4 SQL FK CASCADE schema. **No production write path changes** — `getDefaultAdapter()` is not called from `persist-queue` yet; the IDB outbox adapter remains the sole runtime backend. SQLite is populated in lockstep but read by no one until a follow-up PR sets `enableSqlitePrimary=true`.

## Files added

- `src/lib/persistence/sqlite/executor.ts` — `SqlExecutor` interface.
- `src/lib/persistence/sqlite/schema.sql` — tables, indexes, FK CASCADE.
- `src/lib/persistence/sqlite/migration-runner.ts` — `PRAGMA user_version` ladder.
- `src/lib/persistence/sqlite/client.ts` — lazy `getOpfsSqliteExecutor()` with OPFS-SAH-pool + `:memory:` soft-fallback.
- `src/lib/persistence/sqlite/row-codecs.ts` — Card encode/decode.
- `src/lib/persistence/sqlite/migrate-from-idb.ts` — paged copy + row-count verification + rollback (`MigrationAbort`).
- `src/lib/persistence/opfs-sqlite-adapter.ts` — `PersistAdapter` impl.
- `src/lib/persistence/mirroring-adapter.ts` — fan-out wrapper.
- `src/lib/persistence/adapter-factory.ts` — single decision point; defaults to IDB.
- `src/test/opfs-sqlite-adapter.test.ts` — 5 tests.
- `src/test/migrate-from-idb.test.ts` — 3 tests.

## Files modified

- `src/lib/electron-integration.ts` — added `isElectron()` runtime detector.
- `src/hooks/card-bootstrap/runSchema.ts` — added Step 4 "SQLite migracija…" (15s timeout, Electron-gated, soft-fail).

## Dep

`@sqlite.org/sqlite-wasm@3.53.0-build1` (lazy-imported only inside `client.ts`).

## Verification

- `bunx vitest run src/test/opfs-sqlite-adapter.test.ts src/test/migrate-from-idb.test.ts` → 8/8 passing.
- `bunx tsc --noEmit` → 0 errors (harness).
- Boot order: `runSchema` Steps 1–3 unchanged; Step 4 added at pct=90.

## Migration safety contract (M2)

1. Gated by `kv['migrated-from-idb-v1']` — second run is a single `SELECT` no-op.
2. Reads each Dexie table in 500-row pages via `orderBy('id').offset/limit`.
3. Each table's INSERTs + final `COUNT(*)` verification run in one `transaction(...)`. Mismatch throws `MigrationAbort` inside the callback → SQLite rolls back, Dexie untouched.
4. Parents copied before children (categories → sources → cards / mindMaps / mnemonics) so FK CASCADE constraints don't reject child inserts.
5. Flag written OUTSIDE per-table txes — a crash between the last table commit and the flag write simply re-runs the whole migration (idempotent via `INSERT OR REPLACE`).
6. Failure in `runSchema` Step 4 does NOT throw `SchemaError` — it's logged via `logger.warn` and the user continues to boot on IDB. Next boot retries.

## Deferred to PR-9

1. Vite copy plugin to vendor `.wasm` + worker into `public/sqlite/` for Electron `file://` and dev server.
2. Call `__setPersistAdapter(getDefaultAdapter({enableSqlitePrimary: true, migrationComplete: hasFlag(), isElectron: isElectron()}))` from `persist-queue.ts` module init.
3. Dexie v23: drop `outbox` table once SQLite goes primary.
4. Collapse `category-deletion-service.ts` to a single `DELETE FROM categories` for the SQLite adapter (FK CASCADE takes over); IDB code path keeps the manual cascade.
5. Read-path migration off Dexie (planner / examiner / drafts tables, Zustand hydration, TanStack Query bridges).

## LOC

- Added: ~820 (10 source/schema files + 2 test files).
- Modified: +50 (runSchema Step 4, isElectron helper).
- Removed: 0 — adapter dormant, no callsite changes.
- Net diff: +870. PR-9 will subtract ~500 (outbox table, manual cascade, retired Dexie tables) once SQLite goes live.
