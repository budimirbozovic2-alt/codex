/**
 * Adapter factory — PR-9 M4 (post A1a).
 *
 * Single decision point for which `PersistAdapter` the persist queue uses.
 *
 * Decision matrix (Pure Desktop):
 *   • Non-Electron (Vite dev preview only)            → IDB adapter.
 *   • Electron + migration flag NOT set yet           → MirroringAdapter
 *                                                       (IDB primary, SQLite
 *                                                       mirror) — populates
 *                                                       SQLite in lockstep
 *                                                       until the one-shot
 *                                                       migration completes.
 *   • Electron + migration flag set + sqlite enabled  → OPFS SQLite primary,
 *                                                       IDB mirrored as
 *                                                       rollback insurance.
 *
 * `enableSqlitePrimary` defaults to `true` now that the web build is
 * deprecated; the flag is retained as a kill-switch for emergency rollback.
 */
import type { PersistAdapter } from "./PersistAdapter";
import { idbAdapter } from "./idb-adapter";
import { opfsSqliteAdapter } from "./opfs-sqlite-adapter";
import { createMirroringAdapter } from "./mirroring-adapter";

interface FactoryOptions {
  /** True once the IDB→SQLite one-shot migration has completed (PR-8 M2). */
  migrationComplete?: boolean;
  /** Kill-switch for SQLite primary path. Defaults to true (Pure Desktop). */
  enableSqlitePrimary?: boolean;
  /** Electron-only gate; OPFS-SAH-pool is unreliable in browsers today. */
  isElectron?: boolean;
}

export function getDefaultAdapter(opts: FactoryOptions = {}): PersistAdapter {
  const enableSqlite = opts.enableSqlitePrimary !== false; // default true
  if (!opts.isElectron) return idbAdapter;
  if (!enableSqlite) return idbAdapter;
  if (!opts.migrationComplete) {
    // Lockstep mirror: IDB stays primary so existing read paths are unaffected,
    // SQLite catches every write so the next boot can flip primary cleanly.
    return createMirroringAdapter(idbAdapter, opfsSqliteAdapter);
  }
  // Migration complete — SQLite primary, IDB mirrored for one release as
  // rollback insurance. The Dexie-mirror cut-off comes in a follow-up PR.
  return createMirroringAdapter(opfsSqliteAdapter, idbAdapter);
}
