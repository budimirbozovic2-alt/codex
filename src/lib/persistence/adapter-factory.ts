/**
 * Adapter factory — post A1c-4 / F6.
 *
 * SQLite is the only persistence backend. The legacy IDB adapter and the
 * IDB↔SQLite mirroring shim were dropped together with the one-shot
 * migration completion (Pure Desktop is SQLite-primary unconditionally).
 *
 * - Electron PROD: durable OPFS-SAH-pool.
 * - Non-Electron DEV (lovable.app preview / `bun run dev` in a tab): the
 *   same `opfsSqliteAdapter` is used, but its executor transparently falls
 *   back to an in-memory SQLite (see `sqlite/client.ts` +
 *   `sqlite/dev-fallback.ts`). Non-durable, but UI flows work.
 * - Non-Electron PROD: unreachable — `assertDesktop()` throws at boot.
 *   The historical `noopAdapter` is kept only as a defensive last resort.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { PersistAdapter } from "./PersistAdapter";
import { opfsSqliteAdapter } from "./opfs-sqlite-adapter";

interface FactoryOptions {
  /** Electron-only gate; OPFS-SAH-pool is unreliable in browsers today. */
  isElectron?: boolean;
}

const noopAdapter: PersistAdapter = {
  async bulkApply(_puts: readonly Card[], _deletes: readonly string[]): Promise<void> {
    /* PROD non-Electron is blocked by assertDesktop; this is a defensive no-op. */
  },
};

export function getDefaultAdapter(opts: FactoryOptions = {}): PersistAdapter {
  if (opts.isElectron) return opfsSqliteAdapter;
  // Non-Electron DEV preview — opfsSqliteAdapter resolves to dev in-memory
  // SQLite via getOpfsSqliteExecutor()'s fallback branch.
  if (!import.meta.env.PROD) return opfsSqliteAdapter;
  return noopAdapter;
}
