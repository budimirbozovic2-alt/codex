// A1c-4 F2 — Review-log repository facade. SQLite-primary.
//
// Mirrors the previous debounced micro-queue: callers fire-and-forget
// `append`/`appendMany`; a 250 ms timer drains the queue via
// `bulkPutReviewLog` (one ACID tx per batch). `flush()` force-drains before
// backup/export/quit. `loadRecent(days)` is a bounded-window hydrator used
// by boot to keep the RAM mirror cheap.
import type { ReviewLogEntry } from "@/lib/storage";
import { bulkPutReviewLog, loadRecentReviewLog } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

const _queue: ReviewLogEntry[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 250;
// PR-B: exponential backoff for persistent SQLite failures. Previously every
// retry was re-scheduled at the base DEBOUNCE_MS, so a chronically failing
// write (locked DB, disk pressure) produced a tight 250 ms retry loop that
// flooded the logger and pinned the event loop. We now back off
// 250 → 500 → 1s → 2s → … up to 30 s, and reset on the next successful drain.
const MAX_BACKOFF_MS = 30_000;
let _backoffMs = DEBOUNCE_MS;

// PR-G1 / M-2 fix: track in-flight drain so `flush()` (called from quit /
// backup paths) actually awaits any drain already in progress instead of
// firing a second concurrent `_drain()` that may double-process re-queued
// entries on failure paths.
let _inFlight: Promise<void> | null = null;

async function _drain(): Promise<void> {
  _timer = null;
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  try {
    await bulkPutReviewLog(batch);
    _backoffMs = DEBOUNCE_MS; // success → reset backoff
  } catch (err) {
    logger.error("[reviewLog] sqlite bulk write failed", err);
    _queue.unshift(...batch);
    // Schedule a retry ourselves with exponential backoff so durability
    // does not depend on a follow-up append() and we don't hot-loop.
    _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
    _schedule(_backoffMs);
    throw err;
  }
}

async function _drainGuarded(): Promise<void> {
  if (_inFlight) return _inFlight;
  _inFlight = _drain().finally(() => { _inFlight = null; });
  return _inFlight;
}

function _schedule(delayMs: number = DEBOUNCE_MS): void {
  if (_timer == null) {
    _timer = setTimeout(() => { void _drainGuarded(); }, delayMs);
  }
}

// Flush on tab hide so the debounced queue can never silently drop entries.
declare global {
  var __codexReviewLogVisHandler: (() => void) | undefined;
}
function _onVisibility(): void {
  if (document.visibilityState === "hidden" && _queue.length > 0) {
    void flush();
  }
}
if (typeof document !== "undefined") {
  if (globalThis.__codexReviewLogVisHandler) {
    document.removeEventListener("visibilitychange", globalThis.__codexReviewLogVisHandler);
  }
  globalThis.__codexReviewLogVisHandler = _onVisibility;
  document.addEventListener("visibilitychange", _onVisibility);
}

async function flush(): Promise<void> {
  if (_timer != null) { clearTimeout(_timer); _timer = null; }
  // Wait for any in-flight drain to settle BEFORE starting a new one — this
  // is what makes back-to-back `flush()` calls from quit-backup safe.
  if (_inFlight) await _inFlight;
  await _drainGuarded();
}

export const reviewLogRepository = {
  append(entry: ReviewLogEntry): void {
    _queue.push(entry);
    _schedule();
  },
  appendMany(entries: ReviewLogEntry[]): void {
    if (entries.length === 0) return;
    for (const e of entries) _queue.push(e);
    _schedule();
  },
  flush,
  loadRecent: (days: number): Promise<ReviewLogEntry[]> => loadRecentReviewLog(days),
};
