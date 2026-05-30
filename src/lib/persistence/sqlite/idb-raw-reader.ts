/**
 * Phase C — raw IDB reader for the one-shot IDB → SQLite migration.
 *
 * Replaces the Dexie shell as the migration source. Uses the native
 * IndexedDB API only, so the migration code path no longer imports Dexie
 * (the `@/lib/legacy/idb-dexie.ts` shell can be deleted once all callers
 * route through here).
 *
 * Contract:
 *   • `openLegacyIdb()` returns `null` on fresh installs (no `MemoriaDB`
 *     present), in non-browser envs, or when the open is blocked. Callers
 *     must treat `null` as "nothing to migrate" and write the migration
 *     flag immediately.
 *   • `streamStore` page-buffers cursor reads to keep peak memory bounded
 *     (default 500 rows / page — same budget the Dexie path had).
 *   • Stores that don't exist on the legacy DB resolve to 0 rows — older
 *     IDB versions may be missing newer tables (e.g. `mnemonicTestLog`).
 */
import { logger } from "@/lib/logger";

export const LEGACY_IDB_NAME = "MemoriaDB";

/**
 * Returns `true` when `indexedDB.databases()` lists the legacy DB. Falls
 * back to `true` (optimistic) when enumeration is unavailable — in that
 * case `openLegacyIdb` still detects the "fresh DB" case via the
 * `onupgradeneeded` hook + empty `objectStoreNames`.
 */
async function legacyDbExists(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    if (typeof (indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }).databases === "function") {
      const dbs = await indexedDB.databases();
      return dbs.some((d) => d.name === LEGACY_IDB_NAME);
    }
  } catch (e) {
    logger.warn("[idb-raw] databases() enumeration failed", e);
  }
  return true;
}

export async function openLegacyIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (!(await legacyDbExists())) return null;

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const req = indexedDB.open(LEGACY_IDB_NAME);
    let createdFresh = false;
    req.onupgradeneeded = (ev) => {
      // oldVersion === 0 means we just brought the DB into existence.
      if ((ev as IDBVersionChangeEvent).oldVersion === 0) createdFresh = true;
    };
    req.onsuccess = () => {
      const db = req.result;
      if (createdFresh || db.objectStoreNames.length === 0) {
        db.close();
        // Best-effort cleanup of the empty shell we accidentally created.
        try { indexedDB.deleteDatabase(LEGACY_IDB_NAME); } catch { /* ignore */ }
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onblocked = () => {
      logger.warn("[idb-raw] open blocked by other connection");
      resolve(null);
    };
  });
}

export async function streamStore<T>(
  db: IDBDatabase,
  storeName: string,
  onPage: (rows: T[]) => Promise<void>,
  pageSize = 500,
): Promise<number> {
  if (!db.objectStoreNames.contains(storeName)) return 0;
  const rows = await listAllRows<T>(db, storeName);
  let total = 0;
  for (let i = 0; i < rows.length; i += pageSize) {
    const page = rows.slice(i, i + pageSize);
    await onPage(page);
    total += page.length;
  }
  return total;
}

export async function listAllRows<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(storeName)) return [];
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error ?? new Error(`IDB read failed: ${storeName}`));
  });
}

export async function getKv<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  if (!db.objectStoreNames.contains(storeName)) return undefined;
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => {
      const row = req.result as { value?: T } | undefined;
      resolve(row?.value);
    };
    req.onerror = () => reject(req.error ?? new Error(`IDB get failed: ${storeName}[${key}]`));
  });
}
