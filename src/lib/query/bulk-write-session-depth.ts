/**
 * Tracks active bulk write work phase — suppresses scoped card notifies
 * that would duplicate coordinator commit invalidation.
 */
let _bulkWriteDepth = 0;

export function enterBulkWriteWork(): void {
  _bulkWriteDepth += 1;
}

export function exitBulkWriteWork(): void {
  _bulkWriteDepth = Math.max(0, _bulkWriteDepth - 1);
}

export function getBulkWriteDepth(): number {
  return _bulkWriteDepth;
}

export function resetBulkWriteDepthForTest(): void {
  _bulkWriteDepth = 0;
}
