# P3 PR-8 — OPFS SQLite adapter + outbox decommission + FK CASCADE

## Goal

Land a second `PersistAdapter` implementation backed by **SQLite over OPFS** (`@sqlite.org/sqlite-wasm` official build, OPFS-SAH-pool VFS) for the Electron desktop target, decommission the IDB `outbox` WAL table (replaced by SQLite's own WAL), and move cascade semantics from app-level `categoryDeletionService` orchestration into **`ON DELETE CASCADE` foreign keys** in the SQL schema. No UI changes, no public hook signatures changed.

The PersistAdapter seam introduced in PR-7d M3.2 (`src/lib/persistence/PersistAdapter.ts`) is the only place the read/write hot path needs to swap; everything above it (`persist-queue`, `cardRepository`, store, hooks) keeps its current contract.

## Scope at a glance

```text
Adapter swap (write hot path)
  └─ idbOutboxAdapter   ──►  opfsSqliteAdapter (default in Electron)
                              │  • SQLite WAL replaces outbox table
                              │  • bulkApply = single SQL tx
                              │  • recoverPending = no-op (WAL auto-recovers)
                              └─ FK CASCADE replaces app-level cascade
```

Web build keeps `idbOutboxAdapter` (OPFS-SAH-pool is unreliable cross-browser today). Adapter selection lives in one place.

## Milestones

### M1 — OPFS SQLite infrastructure (no behavior change yet)

1. Add dep `@sqlite.org/sqlite-wasm` (official build). Vendor the `.wasm` + worker into `public/sqlite/` via a Vite copy plugin so Electron `file://` and dev server both serve it.
2. New module `src/lib/persistence/sqlite/`:
   - `sqlite-client.ts` — singleton that boots the OPFS-SAH-pool VFS in a dedicated Worker, exposes `exec`, `run`, `all`, `transaction(fn)`.
   - `schema.sql` — initial `cards`, `categories`, `subcategories`, `chapters`, `sources`, `mindMaps`, `mnemonics`, `outbox_*` (NONE — we drop outbox), `kv` (replaces `settings`), `pomodoroLog`, `reviewLog`, `drafts`, `metacognitive`, `articles`, `aliases`. Each table mirrors current Dexie columns but as proper SQL with PK + indexes equivalent to today's compound indexes.
   - `migrations/001_init.sql` — table creation + indexes.
   - `migrations/002_fk_cascade.sql` — `FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE` on cards, sources, mindMaps, mnemonics, subcategories, chapters; same for `subcategoryId → subcategories(id) ON DELETE CASCADE` and `chapterId → chapters(id) ON DELETE SET NULL` (cards keep their chapter pointer nullable today).
   - `migration-runner.ts` — reads `PRAGMA user_version`, applies pending files in order, sets new version. Uses `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL` on every connection open.
3. `src/lib/persistence/opfs-sqlite-adapter.ts` implementing `PersistAdapter`:
   - `bulkApply(puts, deletes)` → single `BEGIN; ... COMMIT;` with prepared `INSERT OR REPLACE` and `DELETE`. SQLite WAL ⇒ atomic and crash-safe without an explicit outbox row.
   - `enqueueWal(op)` → **no-op** (SQLite already journals). Keep the method to honor the interface but document why it's empty.
   - `recoverPending()` → no-op returning `{ recovered: 0 }`; on open we just call `PRAGMA wal_checkpoint(TRUNCATE)` once to flush any prior session.
4. Tests under `src/test/opfs-sqlite-adapter.test.ts` using `sqlite-wasm` memvfs in node (no OPFS available in vitest) — exercises `bulkApply` atomicity, FK cascade, and migration ladder.

No production wiring yet — adapter is built and unit-tested in isolation.

### M2 — One-shot IDB → SQLite data migration

5. `src/lib/persistence/sqlite/migrate-from-idb.ts`:
   - Runs once on boot when SQLite `kv['migrated-from-idb-v1']` is missing.
   - Reads every Dexie table page-by-page (`offset/limit` via `orderBy('id')`) and bulk-inserts into SQLite inside a single tx per table.
   - Verifies row-counts per table; on mismatch, rolls back the SQLite transaction and leaves Dexie untouched so the user keeps booting on IDB while the failure is logged.
   - On success, writes `kv['migrated-from-idb-v1'] = { at: Date.now(), counts }` and **does not delete** Dexie data (kept as fallback for one release; PR-9 deletes it).
6. Wire into `src/hooks/card-bootstrap/runSchema.ts` as Step 4 ("SQLite migracija…") after the existing mnemonic step. Gated by `isElectron()` from `src/lib/electron-integration.ts`.

### M3 — Adapter swap + outbox decommission

7. `src/lib/persistence/adapter-factory.ts`:
   - `getDefaultAdapter()` returns `opfsSqliteAdapter` when `isElectron()` **and** the M2 migration flag is set; otherwise `idbOutboxAdapter`.
   - Called once from `persist-queue.ts` module init via `__setPersistAdapter(getDefaultAdapter())`. No other call site changes.
8. After M2 migration flag is set, reads gradually move too — but **out of scope here** (PR-9). For PR-8 we keep the Zustand store hydrated from Dexie at boot; writes go to SQLite via the adapter, and a thin **mirror-to-Dexie** behind a feature flag (`MIRROR_WRITES_TO_IDB=true` for one release) gives us a rollback path. The mirror is implemented as a wrapping adapter `MirroringAdapter(primary, secondary)` that fans `bulkApply` to both, awaits primary, fires-and-forgets secondary.
9. Dexie v23 migration: drops the `outbox` table. Runs only after `kv['migrated-from-idb-v1']` is set. Outbox WAL recovery code path in `persist-queue.recoverOutboxOnBoot` becomes adapter-delegated (already is) and returns `{recovered:0}` for the SQLite adapter.

### M4 — FK CASCADE replaces app-level cascade

10. With FK constraints live, `src/lib/category-deletion-service.ts` collapses from a multi-table orchestrator into a single `DELETE FROM categories WHERE id = ?` plus the planner-storage write mutex it already holds (planner data lives outside SQLite for now, so app-level cleanup still needed there).
11. Keep the public API of `cascadeDeleteCategoryDomains` unchanged; internals branch on adapter type. The IDB code path retains today's manual cascade (web build).
12. Test `src/test/category-cascade-sql.test.ts` proves: deleting a category removes cards/sources/mindMaps/mnemonics/subcategories/chapters in one tx, no orphans.

## Technical notes

- **Why OPFS-SAH-pool, not OPFS direct**: SAH-pool gives synchronous-on-worker file handles without the cross-origin-isolation requirement. Electron meets COI, but SAH-pool is also dramatically faster for our small-frequent-write profile.
- **Boot DAG**: SQLite open is added as Step 1.5 in `bootDb.ts` (parallel with Dexie open during the migration release; SQLite-only after PR-9). Failure of SQLite open in Electron falls back to IDB adapter and logs to health monitor — never blocks boot.
- **Type safety**: SQL row → domain conversion lives in `sqlite/row-codecs.ts` with zero-`any` discipline (zod or hand-rolled type guards mirroring existing `Card`/`Source`/etc shapes).
- **WriteResult**: adapter still returns `Promise<void>`; the `WriteResult<T>` envelope continues to be applied at the `cardRepository` layer (PR-7d M2.4 contract preserved).
- **Test seam**: `__setPersistAdapter` remains the only way tests swap implementations. In-memory SQLite (`:memory:` via wasm) is used in vitest.

## Out of scope (deferred to PR-9)

- Reads from SQLite (Zustand hydration + selectors). PR-8 stays write-only on SQLite to limit blast radius.
- Removal of Dexie tables that don't yet have SQLite counterparts (planner, examiner profile, mnemonic test log) — those migrate in PR-9 once the read path lands.
- TanStack Query bridges for SQLite-backed entities (depends on read-path move).
- Web build OPFS support / deprecation decision.
- Drafts table migration (low-risk, defer to PR-9 to keep PR-8 reviewable).

## Verification

1. `bunx tsc --noEmit` — 0 errors.
2. `bunx vitest run` — full suite green, including new `opfs-sqlite-adapter.test.ts`, `category-cascade-sql.test.ts`, `migrate-from-idb.test.ts`.
3. Manual Electron smoke: fresh profile boots, migrates seed data, all existing views render unchanged.
4. Manual Electron smoke: kill process during a write burst → next boot has no data loss and no `outbox` recovery toast (SQLite WAL replay is silent).
5. Crash-safety test: `bulkApply` interrupted mid-tx (simulated via adapter throw between prepare and commit) leaves DB in pre-tx state.
6. `rg "db\.outbox" src/` returns only the v23 drop migration after M3.

## Risks & mitigations

- **OPFS quota / corruption in Electron**: SAH-pool is well-tested but new to this app. Mitigation: M3 ships behind `MIRROR_WRITES_TO_IDB=true` for one release — instant rollback by flipping the adapter factory.
- **Migration row-count mismatch**: M2 verifies counts and rolls back on failure; user continues on IDB and we get a health-monitor entry.
- **FK constraint surprises**: existing data may have orphaned rows from earlier bugs. M2 migration logs and drops orphans (with a one-line report) before enabling FKs so the constraint switch is clean.
- **`.wasm` loading in Electron production build**: verify `electron-builder` packs `public/sqlite/*.wasm` and the worker via `extraResources`; add a smoke test in CI that boots the packaged binary headlessly.
- **Dexie v23 migration ordering**: drop runs only after migration flag is set; otherwise Dexie upgrade is a no-op on this release.

## LOC estimate

- Added: ~800 (adapter, sqlite client, migrations, codecs, tests).
- Removed: ~500 (outbox table + recovery logic + manual cascade branches that are SQL-only).
- Net: +300 with a clear deletion target in PR-9 (Dexie removal) of another ~1500.
