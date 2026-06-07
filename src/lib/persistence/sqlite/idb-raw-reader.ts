/**
 * Phase C — Raw IDB reader for one-shot migration.
 * Replaces Dexie shell as the migration source.
 * Uses native IndexedDB API exclusively.
 *
 * PR-H7 Hardening: Eliminated ultra-long inline casts
 * to enforce Safe-Paste compliance across build steps.
 */
import { logger } from "@/lib/logger";

export const LEGACY_IDB_NAME = "MemoriaDB";

interface ExtendedIDBFactory extends IDBFactory {
  databases?: () => Promise<IDBDatabaseInfo[]>;
}

/**
 * Returns true when legacy DB exists in filesystem.
 * Falls back to true when enumeration is missing.
 */
async function legacyDbExists(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const factory = indexedDB as ExtendedIDBFactory;
    if (typeof factory.databases === "function") {
      const dbs = await factory.databases();
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
      if ((ev as IDBVersionChangeEvent).oldVersion === 0) {
        createdFresh = true;
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (createdFresh || db.objectStoreNames.length === 0) {
        db.close();
        try { 
          indexedDB.deleteDatabase(LEGACY_IDB_NAME); 
        } catch { /* ignore */ }
        resolve(null);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(
      req.error ?? new Error("IDB open failed")
    );
    req.onblocked = () => {
      logger.warn("[idb-raw] open blocked by active lock");
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

export async function listAllRows<T>(
  db: IDBDatabase, 
  storeName: string
): Promise<T[]> {
  if (!db.objectStoreNames.contains(storeName)) return [];
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(
      req.error ?? new Error(`IDB read failed: ${storeName}`)
    );
  });
}

export async function getKv<T>(
  db: IDBDatabase, 
  storeName: string, 
  key: string
): Promise<T | undefined> {
  if (!db.objectStoreNames.contains(storeName)) return undefined;
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => {
      const row = req.result as { value?: T } | undefined;
      resolve(row?.value);
    };
    req.onerror = () => reject(
      req.error ?? new Error(`IDB get failed: ${storeName}[${key}]`)
    );
  });
}