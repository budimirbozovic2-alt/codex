/**
 * Adapter factory — PR-8 M3.
 *
 * Single decision point for which `PersistAdapter` the persist queue uses.
 * Today this returns the IDB outbox adapter unconditionally (zero behavior
 * change vs. PR-7d). The SQLite + mirroring path is wired and ready; flip
 * `ENABLE_SQLITE_PRIMARY` in `feature-flags.ts` (next PR) to activate it
 * once Electron QA signs off.
 *
 * Lives in its own file so swap rollout doesn't require touching the persist
 * queue — `persist-queue.ts` calls `__setPersistAdapter(getDefaultAdapter())`
 * at module init.
 */
import type { PersistAdapter } from "./PersistAdapter";
import { idbOutboxAdapter } from "./idb-outbox-adapter";
import { opfsSqliteAdapter } from "./opfs-sqlite-adapter";
import { createMirroringAdapter } from "./mirroring-adapter";

interface FactoryOptions {
  /** True once the IDB→SQLite one-shot migration has completed (PR-8 M2). */
  migrationComplete?: boolean;
  /** When true, SQLite becomes primary; IDB is mirrored as rollback insurance. */
  enableSqlitePrimary?: boolean;
  /** Electron-only gate; OPFS-SAH-pool is unreliable in browsers today. */
  isElectron?: boolean;
}

export function getDefaultAdapter(opts: FactoryOptions = {}): PersistAdapter {
  const useSqlite = Boolean(opts.enableSqlitePrimary && opts.migrationComplete && opts.isElectron);
  if (!useSqlite) return idbOutboxAdapter;
  // Mirror writes back to IDB for one release so we can roll back cleanly.
  return createMirroringAdapter(opfsSqliteAdapter, idbOutboxAdapter);
}
