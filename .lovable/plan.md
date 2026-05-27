# P3 PR-8 finale — "Pure Desktop" (SHIPPED)

Production target is now exclusively Electron. Web build is deprecated; `bun run dev` still works in a browser tab for HMR convenience but production assertion throws in `main.tsx` if the renderer is not hosted by Electron.

## Shipped changes

### 1. PWA surface removed
- `public/sw.js` — DELETED.
- `public/manifest.json` — DELETED.
- `index.html` — removed `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">`.
- `src/main.tsx` — register call removed; cleanup `unregister()` + cache purge retained for one release to clean up stale SWs from previous web installs.

### 2. Desktop assertion
- `src/lib/electron-integration.ts` — added `assertDesktop()`. No-op in dev (`!import.meta.env.PROD`), throws in production if `!isElectron()`.
- `src/main.tsx` — calls `assertDesktop()` first thing inside the async bootstrap.

### 3. SQLite-primary cutover (gated by migration flag)
- `src/lib/persistence/adapter-factory.ts` — decision matrix:
  - `!isElectron` → `idbOutboxAdapter` (dev preview only).
  - `isElectron + !migrationComplete` → `MirroringAdapter(IDB primary, SQLite mirror)`.
  - `isElectron + migrationComplete` → `MirroringAdapter(SQLite primary, IDB mirror)`.
- `src/lib/persistence/sqlite/migrate-from-idb.ts` — on success, also writes `localStorage[MIGRATION_FLAG_KEY]` so module-init code can sync-detect completion. New `hasMigrationFlagSync()` export.
- `src/lib/persist-queue.ts` — `pickInitialAdapter()` at module load reads `window.electronAPI` + `hasMigrationFlagSync()` and calls `getDefaultAdapter()`. SQLite primary turns on automatically on the boot *after* the migration completes.

### 4. SQLite WASM packaging
- `vite.config.ts` — added `copySqliteWasmPlugin` (inline, no new deps) that copies `sqlite3.wasm`, `sqlite3-opfs-async-proxy.js`, `sqlite3-worker1.mjs` into `dist/sqlite/` during build so the Electron renderer can resolve them under `file://`.

### 5. Build scripts
- `package.json` — added `build:renderer` (alias of `build`), `build:desktop` (renderer + electron-builder), and `build:web` that exits with a deprecation message. `build` stays as `vite build` for the Lovable harness type-check.

### 6. Drafts comment update
- `src/lib/drafts/draftRegistry.ts` — replaced BroadcastChannel comment with "single Electron window — no cross-window sync".

## Verification
- `bunx tsc --noEmit` → 0 errors.
- `bunx vitest run src/test/opfs-sqlite-adapter.test.ts src/test/migrate-from-idb.test.ts` → 8/8 passing.

## Adapter rollout timeline

```
Boot N (post-deploy, first run):
  persist-queue init → flag absent → IDB-primary + SQLite mirror
  runSchema Step 4   → copy IDB → SQLite → write flag (kv + localStorage)
  Steady state       → writes hit both

Boot N+1 (and beyond):
  persist-queue init → flag present → SQLite-primary + IDB mirror
  Steady state       → reads still IDB (until PR-9), writes hit both
```

## Out of scope (PR-9)

1. Read-path migration off Dexie to SQLite + TanStack Query (planner, examiner, drafts).
2. Drop IDB `outbox` table (Dexie v23) + drop IDB mirror once SQLite primary has soaked.
3. Collapse `category-deletion-service.ts` to a single `DELETE FROM categories` for the SQLite path (FK CASCADE).
4. Remove `isElectron()` else branches in 8 callsites once dev preview support is retired.
5. Remove SW cleanup block from `main.tsx`.
6. Drop `dexie` dep once all tables migrate.

## LOC delta
- Deleted: ~210 (sw.js, manifest.json, PWA tags).
- Added: ~95 (assertDesktop, adapter factory matrix, hasMigrationFlagSync, Vite WASM copy, persist-queue init).
- Modified: ~25 (package scripts, draftRegistry comment).
- Net: **−90**.
