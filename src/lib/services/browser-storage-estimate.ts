export interface StorageUsageEstimate {
  usedBytes: number;
  maxBytes: number;
  percent: number;
}

/** Browser quota estimate (OPFS / IndexedDB backing store). Not SQLite file size. */
export async function getBrowserStorageEstimate(): Promise<StorageUsageEstimate> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const max = est.quota ?? 500 * 1024 * 1024;
    return { usedBytes: used, maxBytes: max, percent: Math.round((used / max) * 100) };
  }
  return { usedBytes: 0, maxBytes: 0, percent: 0 };
}

/** @deprecated Use `getBrowserStorageEstimate`. Kept for migration from `@/lib/storage`. */
export const getStorageUsage = getBrowserStorageEstimate;
