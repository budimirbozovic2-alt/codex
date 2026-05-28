/**
 * Adapter factory — post A1c-4 / F6.
 *
 * SQLite is the only persistence backend. The legacy IDB adapter and the
 * IDB↔SQLite mirroring shim were dropped together with the one-shot
 * migration completion (Pure Desktop is SQLite-primary unconditionally).
 *
 * The non-Electron path (Vite dev preview in a browser) gets a noop adapter
 * so the persist queue still drains without throwing — durability there is
 * a non-goal.
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
    /* dev-preview only — SQLite/OPFS lives in Electron */
  },
};

export function getDefaultAdapter(opts: FactoryOptions = {}): PersistAdapter {
  if (!opts.isElectron) return noopAdapter;
  return opfsSqliteAdapter;
}
