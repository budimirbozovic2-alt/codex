# P3 PR-8 — OPFS SQLite adapter + outbox decommission (M1+M3+M4 shipped, dormant)

## Shipped scope

M1 infrastructure, M3 adapter factory, M4 SQL FK CASCADE schema. **No production write path changes** — `getDefaultAdapter()` returns `idbOutboxAdapter` unconditionally until a follow-up PR sets `enableSqlitePrimary=true`. This keeps the SQLite branch reviewable and unit-tested in isolation while the read-path (PR-9) catches up.

## Files added

- `src/lib/persistence/sqlite/executor.ts` — `SqlExecutor` interface (run/all/exec/transaction/close).
- `src/lib/persistence/sqlite/schema.sql` — tables + indexes + FK CASCADE; categories/sources/cards/mindMaps/mnemonics/kv.
- `src/lib/persistence/sqlite/migration-runner.ts` — `PRAGMA user_version` ladder, foreign_keys + WAL.
- `src/lib/persistence/sqlite/client.ts` — lazy `getOpfsSqliteExecutor()` singleton with OPFS-SAH-pool VFS + :memory: soft-fall-back.
- `src/lib/persistence/sqlite/row-codecs.ts` — Card encode/decode + `CARD_INSERT_SQL`.
- `src/lib/persistence/sqlite/migrate-from-idb.ts` — M2 one-shot copy gated by `kv['migrated-from-idb-v1']`.
- `src/lib/persistence/opfs-sqlite-adapter.ts` — `PersistAdapter` impl; `enqueueWal`/`recoverPending` no-ops by design.
- `src/lib/persistence/mirroring-adapter.ts` — fan-out wrapper (primary awaited, secondary fire-and-forget).
- `src/lib/persistence/adapter-factory.ts` — single decision point; defaults to IDB.
- `src/test/opfs-sqlite-adapter.test.ts` — 5 tests, all green.

## Dep

`@sqlite.org/sqlite-wasm@3.53.0-build1` (lazy-imported only inside `client.ts`; SSR / Node test paths never touch the wasm runtime).

## Verification

- `bunx vitest run src/test/opfs-sqlite-adapter.test.ts` → 5/5 passing.
- `bunx tsc --noEmit` → 0 errors (harness).
- `rg "getDefaultAdapter\\(" src/` → only definition site; persist-queue still uses `idbOutboxAdapter` directly (intentional — no behavior change).

## Deferred to follow-up PR (PR-8.1 / PR-9)

1. Vite copy plugin to vendor `.wasm` + worker into `public/sqlite/` for Electron `file://` and dev server.
2. Wire `migrateFromIdb()` into `src/hooks/card-bootstrap/runSchema.ts` (Step 4 "SQLite migracija…") behind `isElectron()`.
3. Call `__setPersistAdapter(getDefaultAdapter({...flags}))` from `persist-queue.ts` module init.
4. Dexie v23: drop `outbox` table once migration flag is set.
5. Collapse `category-deletion-service.ts` to a single `DELETE FROM categories` for the SQLite adapter (FK CASCADE takes over); IDB code path keeps the manual cascade.
6. Read-path migration off Dexie (planner / examiner / drafts tables, Zustand hydration, TanStack Query bridges).

## Risks

- OPFS-SAH-pool reliability across Electron versions: not exercised in this PR (adapter dormant). Smoke test required before flipping the factory.
- `.wasm` packaging: must be added to `electron-builder` `extraResources`; smoke-test by booting the packaged binary headlessly.
- Migration row-count verification: current script has no rollback-on-mismatch guard yet; add before wiring into boot.

## LOC

- Added: ~720 (8 source files + 1 test file).
- Removed: 0 — dormant rollout, no callsite changes.
- Net diff: +720. Follow-up PRs will subtract ~500 (outbox table, manual cascade, Dexie tables) once SQLite goes live.
