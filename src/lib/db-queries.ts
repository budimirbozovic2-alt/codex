import { db } from "./db-schema";
import type { CategoryRecord } from "./db-schema";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry } from "./types/logs";

import { logger } from "@/lib/logger";
// ─── Cards ──────────────────────────────────────────────

export async function idbLoadCards(): Promise<Card[]> {
  return db.cards.toArray();
}

function hasInnerQuotaError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("inner" in err)) return false;
  const inner = (err as Record<string, unknown>).inner;
  return typeof inner === "object" && inner !== null && (inner as Record<string, unknown>).name === "QuotaExceededError";
}

export async function idbPutCard(card: Card): Promise<void> {
  try {
    await db.cards.put(card);
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "QuotaExceededError" || hasInnerQuotaError(err)) {
      logger.error("[MemoriaDB] Storage quota exceeded", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

export async function idbBulkPutCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  try {
    await db.cards.bulkPut(cards);
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "QuotaExceededError" || hasInnerQuotaError(err)) {
      logger.error("[MemoriaDB] Storage quota exceeded during bulk write", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

export async function idbDeleteCard(id: string): Promise<void> {
  await db.cards.delete(id);
}

/**
 * Atomic batch: puts and deletes execute in a single rw transaction so a
 * crash mid-flush can never leave the store half-applied. Used by the
 * surgical persist queue.
 */
export async function idbBulkApply(
  puts: Card[],
  deleteIds: string[],
): Promise<void> {
  if (puts.length === 0 && deleteIds.length === 0) return;
  try {
    await db.transaction("rw", db.cards, async () => {
      if (puts.length > 0) await db.cards.bulkPut(puts);
      if (deleteIds.length > 0) await db.cards.bulkDelete(deleteIds);
    });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "QuotaExceededError" || hasInnerQuotaError(err)) {
      logger.error("[MemoriaDB] Storage quota exceeded during bulk apply", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

// ─── Categories ─────────────────────────────────────────

export async function idbLoadCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy("sortOrder").toArray();
}

export async function idbSaveCategory(cat: CategoryRecord): Promise<void> {
  await db.categories.put(cat);
}

export async function idbSaveCategories(cats: CategoryRecord[]): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    await db.categories.bulkPut(cats);
    const keepIds = new Set(cats.map(c => c.id));
    const allKeys = await db.categories.toCollection().primaryKeys();
    const toDelete = allKeys.filter(k => !keepIds.has(k as string));
    if (toDelete.length > 0) await db.categories.bulkDelete(toDelete);
  });
}

export async function idbDeleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

// ─── Review Log ─────────────────────────────────────────

export async function idbLoadReviewLog(): Promise<ReviewLogEntry[]> {
  return db.reviewLog.toArray();
}

/**
 * Audit V4: Memory-efficient review log iteration.
 * Uses .each() cursor instead of .toArray() to avoid O(N) RAM spikes.
 */
export async function idbForEachReviewLog(callback: (entry: ReviewLogEntry) => void | Promise<void>): Promise<void> {
  await db.reviewLog.each(callback);
}

export async function idbLoadRecentReviewLog(days: number = 90): Promise<ReviewLogEntry[]> {
  const cutoff = Date.now() - days * 86400000;
  return db.reviewLog.where("timestamp").aboveOrEqual(cutoff).toArray();
}

export async function idbCountReviewLog(): Promise<number> {
  return db.reviewLog.count();
}

// ─── Review log persist queue ───────────────────────────
// Append-only micro-queue, drained by a 250 ms debounce timer using
// `db.reviewLog.bulkAdd`. Prevents IDB write-queue floods during fast
// review streaks (Zen mode, 10+ grades/sec).

const _reviewLogQueue: ReviewLogEntry[] = [];
let _reviewLogTimer: ReturnType<typeof setTimeout> | null = null;
const REVIEW_LOG_DEBOUNCE_MS = 250;

async function _flushReviewLogQueue(): Promise<void> {
  _reviewLogTimer = null;
  if (_reviewLogQueue.length === 0) return;
  const batch = _reviewLogQueue.splice(0, _reviewLogQueue.length);
  try {
    await db.reviewLog.bulkAdd(batch);
  } catch (err: unknown) {
    logger.error("[reviewLog] bulk write failed", err);
    // Re-queue so we don't silently lose entries on transient failures.
    _reviewLogQueue.unshift(...batch);
    throw err;
  }
}

/** Enqueue a review-log entry. Batched & debounced (250 ms) to avoid
 *  flooding Dexie's serialized write queue during fast review streaks. */
export function idbAddReviewLogEntry(entry: ReviewLogEntry): void {
  _reviewLogQueue.push(entry);
  if (_reviewLogTimer == null) {
    _reviewLogTimer = setTimeout(() => { void _flushReviewLogQueue(); }, REVIEW_LOG_DEBOUNCE_MS);
  }
}

/**
 * B2: Bulk variant — enqueues N entries with a SINGLE timer schedule.
 * Replaces N×idbAddReviewLogEntry calls in tight loops (Zen mode flushes,
 * session-end commit). Reduces timer churn and lets Dexie coalesce them
 * into one bulkAdd transaction.
 */
export function idbAddReviewLogEntries(entries: ReviewLogEntry[]): void {
  if (entries.length === 0) return;
  for (const entry of entries) _reviewLogQueue.push(entry);
  if (_reviewLogTimer == null) {
    _reviewLogTimer = setTimeout(() => { void _flushReviewLogQueue(); }, REVIEW_LOG_DEBOUNCE_MS);
  }
}

/** Force-drain the queue. Call before backup/export/full-restore so no
 *  pending entries are missed. */
export async function flushReviewLogQueue(): Promise<void> {
  if (_reviewLogTimer != null) { clearTimeout(_reviewLogTimer); _reviewLogTimer = null; }
  await _flushReviewLogQueue();
}

// V2: Flush review-log on tab hide so the queue (debounced 250 ms) can never
// silently drop entries when the user closes the tab inside that window.
// Module-level handler with HMR cleanup mirrors the persist-queue pattern.
declare global {
  // eslint-disable-next-line no-var
  var __codexReviewLogVisHandler: (() => void) | undefined;
}
function _reviewLogOnVisibility(): void {
  if (document.visibilityState === "hidden" && _reviewLogQueue.length > 0) {
    void flushReviewLogQueue();
  }
}
if (typeof document !== "undefined") {
  if (globalThis.__codexReviewLogVisHandler) {
    document.removeEventListener("visibilitychange", globalThis.__codexReviewLogVisHandler);
  }
  globalThis.__codexReviewLogVisHandler = _reviewLogOnVisibility;
  document.addEventListener("visibilitychange", _reviewLogOnVisibility);
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      if (globalThis.__codexReviewLogVisHandler) {
        document.removeEventListener("visibilitychange", globalThis.__codexReviewLogVisHandler);
        globalThis.__codexReviewLogVisHandler = undefined;
      }
      if (_reviewLogQueue.length > 0) void flushReviewLogQueue();
    } catch (e) { logger.warn("[reviewLog] HMR dispose failed", e); }
  });
}

// ─── Settings ───────────────────────────────────────────

export async function idbLoadSettings<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function idbSaveSettings(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── Fast aggregation helpers ───────────────────────────

export async function idbCountCardsByCategory(categoryId: string): Promise<number> {
  return db.cards.where("categoryId").equals(categoryId).count();
}

export async function idbCountAllCards(): Promise<number> {
  return db.cards.count();
}

export async function idbCountByType(type: string): Promise<number> {
  return db.cards.where("type").equals(type).count();
}

/**
 * Audit #7: Optimized chapter filtering using composite index.
 * Fetches cards for a specific chapter within a category directly from IDB.
 */
export async function idbLoadCardsByChapter(categoryId: string, chapterId: string): Promise<Card[]> {
  return db.cards.where("[categoryId+chapterId]").equals([categoryId, chapterId]).toArray();
}

export async function idbCountReviewLogSince(since: number): Promise<number> {
  return db.reviewLog.where("timestamp").aboveOrEqual(since).count();
}
