// A1c-4 F2 — Review-log repository facade. SQLite-primary.
//
// Mirrors the previous Dexie-debounced micro-queue: callers fire-and-forget
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

async function _drain(): Promise<void> {
  _timer = null;
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  try {
    await bulkPutReviewLog(batch);
  } catch (err) {
    logger.error("[reviewLog] sqlite bulk write failed", err);
    _queue.unshift(...batch);
    // Audit v2 / Wave A.4: previously this just re-enqueued and threw. The
    // caller (`void _drain()` inside a setTimeout) discarded the rejection,
    // so the timer was already null and no new flush was scheduled. In a
    // quiet session the queue sat stranded until the user issued the next
    // `append()` or backup/quit triggered a flush(). Schedule the retry
    // ourselves so durability does not depend on user action.
    _schedule();
    throw err;
  }
}


function _schedule(): void {
  if (_timer == null) {
    _timer = setTimeout(() => { void _drain(); }, DEBOUNCE_MS);
  }
}

// Flush on tab hide so the debounced queue can never silently drop entries.
declare global {
  // eslint-disable-next-line no-var
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
  await _drain();
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
