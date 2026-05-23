// ─────────────────────────────────────────────────────────────────────────────
// Task Scheduler — single point for setTimeout / setInterval / requestIdleCallback.
//
// Centralizes the 40+ scattered timer call sites scattered through hooks,
// repositories and lib modules so we can:
//
//   • inspect what is currently scheduled (`snapshot()` for debugging),
//   • shut everything down at `beforeunload` / Electron `before-quit` to
//     avoid IDB writes after the page is gone,
//   • optionally pause "idle" work while the tab is hidden, resuming when
//     it becomes visible again,
//   • drive everything from `vi.useFakeTimers()` in tests through one
//     well-known surface (`taskScheduler` singleton).
//
// IMPORTANT: this is *not* a replacement for tight loops like the Pomodoro
// engine or Speed Reader RSVP — those keep raw `setTimeout` because their
// drift budget is sub-frame. Everything else should funnel through here.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "@/lib/logger";

export type Priority = "high" | "normal" | "idle";

export interface ScheduleOptions {
  /** Required, human-readable label used in `snapshot()` + dev warnings. */
  label: string;
  /** Default "normal". `"idle"` is auto-paused when `document.visibilityState === "hidden"`. */
  priority?: Priority;
  /**
   * Whether to pause this task when the tab is hidden. Defaults to `true`
   * for `"idle"`, `false` for `"normal"` / `"high"`. Pausing snapshots the
   * remaining delay and re-schedules on `visibilitychange → visible`.
   */
  pauseWhenHidden?: boolean;
  /** Optional AbortSignal — abort() cancels the task. */
  signal?: AbortSignal;
}

export type TaskHandle = number;

interface BaseTaskRecord {
  handle: TaskHandle;
  label: string;
  priority: Priority;
  pauseWhenHidden: boolean;
  scheduledAt: number;
  /** Underlying browser timer id; null while paused. */
  timerId: ReturnType<typeof globalThis.setTimeout> | null;
  /** For pause/resume: ms remaining when paused. */
  remainingMs: number;
  /** Absolute timestamp at which the timer was (re)started. */
  startedAt: number;
  fn: () => void;
}

interface TimeoutTaskRecord extends BaseTaskRecord {
  kind: "timeout";
  delayMs: number;
}

interface IntervalTaskRecord extends BaseTaskRecord {
  kind: "interval";
  delayMs: number;
}

interface IdleTaskRecord extends BaseTaskRecord {
  kind: "idle";
  /** `requestIdleCallback` id when running via rIC, else null. */
  idleId: number | null;
}

type TaskRecord = TimeoutTaskRecord | IntervalTaskRecord | IdleTaskRecord;

export interface TaskSnapshot {
  handle: TaskHandle;
  label: string;
  priority: Priority;
  kind: TaskRecord["kind"];
  scheduledAt: number;
  paused: boolean;
}

type IdleWindow = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

let nextHandle = 1;

class TaskScheduler {
  private tasks = new Map<TaskHandle, TaskRecord>();
  private shutdownFlag = false;
  private visibilityListener: (() => void) | null = null;
  private warnedShutdownOnce = false;

  constructor() {
    if (typeof document !== "undefined") {
      this.visibilityListener = () => this.onVisibilityChange();
      document.addEventListener("visibilitychange", this.visibilityListener);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Public scheduling API
  // ───────────────────────────────────────────────────────────────────────

  setTimeout(fn: () => void, ms: number, opts: ScheduleOptions): TaskHandle {
    if (this.assertNotShutdown(opts.label)) return -1;
    const handle = nextHandle++;
    const record: TimeoutTaskRecord = {
      kind: "timeout",
      handle,
      label: opts.label,
      priority: opts.priority ?? "normal",
      pauseWhenHidden: opts.pauseWhenHidden ?? false,
      scheduledAt: Date.now(),
      startedAt: Date.now(),
      timerId: null,
      remainingMs: Math.max(0, ms),
      delayMs: Math.max(0, ms),
      fn: () => {
        this.tasks.delete(handle);
        try { fn(); } catch (err) { logger.warn(`[scheduler:${opts.label}] handler threw`, err); }
      },
    };
    this.tasks.set(handle, record);
    this.bindAbort(opts.signal, handle);
    this.startTask(record);
    return handle;
  }

  setInterval(fn: () => void, ms: number, opts: ScheduleOptions): TaskHandle {
    if (this.assertNotShutdown(opts.label)) return -1;
    const handle = nextHandle++;
    const record: IntervalTaskRecord = {
      kind: "interval",
      handle,
      label: opts.label,
      priority: opts.priority ?? "normal",
      pauseWhenHidden: opts.pauseWhenHidden ?? false,
      scheduledAt: Date.now(),
      startedAt: Date.now(),
      timerId: null,
      remainingMs: Math.max(0, ms),
      delayMs: Math.max(0, ms),
      fn: () => {
        try { fn(); } catch (err) { logger.warn(`[scheduler:${opts.label}] handler threw`, err); }
      },
    };
    this.tasks.set(handle, record);
    this.bindAbort(opts.signal, handle);
    this.startTask(record);
    return handle;
  }

  /**
   * Schedule a one-shot idle task. Uses `requestIdleCallback` when available
   * with the given `timeoutMs` ceiling; falls back to `setTimeout(fallbackMs)`.
   */
  idle(
    fn: () => void,
    opts: ScheduleOptions & { timeoutMs?: number; fallbackMs?: number },
  ): TaskHandle {
    if (this.assertNotShutdown(opts.label)) return -1;
    const handle = nextHandle++;
    const priority = opts.priority ?? "idle";
    const pauseWhenHidden = opts.pauseWhenHidden ?? (priority === "idle");
    const record: IdleTaskRecord = {
      kind: "idle",
      handle,
      label: opts.label,
      priority,
      pauseWhenHidden,
      scheduledAt: Date.now(),
      startedAt: Date.now(),
      timerId: null,
      idleId: null,
      remainingMs: opts.fallbackMs ?? 50,
      fn: () => {
        this.tasks.delete(handle);
        try { fn(); } catch (err) { logger.warn(`[scheduler:${opts.label}] handler threw`, err); }
      },
    };
    this.tasks.set(handle, record);
    this.bindAbort(opts.signal, handle);
    this.startIdleTask(record, opts.timeoutMs ?? 2000);
    return handle;
  }

  /**
   * Trailing-edge debounce that funnels through `setTimeout` so it
   * participates in the same shutdown / inspection contract.
   */
  debounce<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void,
    ms: number,
    opts: ScheduleOptions,
  ): ((...args: TArgs) => void) & { cancel: () => void; flush: () => void } {
    let pendingHandle: TaskHandle | null = null;
    let lastArgs: TArgs | null = null;

    const debounced = (...args: TArgs) => {
      lastArgs = args;
      if (pendingHandle !== null) this.cancel(pendingHandle);
      pendingHandle = this.setTimeout(
        () => {
          pendingHandle = null;
          if (lastArgs) {
            const a = lastArgs;
            lastArgs = null;
            fn(...a);
          }
        },
        ms,
        opts,
      );
    };
    debounced.cancel = () => {
      if (pendingHandle !== null) {
        this.cancel(pendingHandle);
        pendingHandle = null;
        lastArgs = null;
      }
    };
    debounced.flush = () => {
      if (pendingHandle !== null && lastArgs) {
        this.cancel(pendingHandle);
        pendingHandle = null;
        const a = lastArgs;
        lastArgs = null;
        try { fn(...a); } catch (err) { logger.warn(`[scheduler:${opts.label}] flush threw`, err); }
      }
    };
    return debounced;
  }

  cancel(handle: TaskHandle): void {
    const record = this.tasks.get(handle);
    if (!record) return;
    this.stopTask(record);
    this.tasks.delete(handle);
  }

  cancelByLabel(labelPrefix: string): number {
    let n = 0;
    for (const [handle, record] of this.tasks) {
      if (record.label.startsWith(labelPrefix)) {
        this.stopTask(record);
        this.tasks.delete(handle);
        n++;
      }
    }
    return n;
  }

  snapshot(): TaskSnapshot[] {
    const out: TaskSnapshot[] = [];
    for (const record of this.tasks.values()) {
      out.push({
        handle: record.handle,
        label: record.label,
        priority: record.priority,
        kind: record.kind,
        scheduledAt: record.scheduledAt,
        paused: record.timerId === null && (record.kind !== "idle" || record.idleId === null),
      });
    }
    return out;
  }

  /**
   * Tear down all pending tasks. Idempotent. After shutdown, further
   * scheduling calls log a single DEV warning and return -1.
   */
  shutdown(): void {
    if (this.shutdownFlag) return;
    this.shutdownFlag = true;
    for (const record of this.tasks.values()) this.stopTask(record);
    this.tasks.clear();
    if (this.visibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityListener);
      this.visibilityListener = null;
    }
  }

  /** Test-only: clear pending and reset the shutdown flag. */
  __resetForTests(): void {
    for (const record of this.tasks.values()) this.stopTask(record);
    this.tasks.clear();
    this.shutdownFlag = false;
    this.warnedShutdownOnce = false;
  }

  /** Test-only: synchronous count of pending tasks. */
  __sizeForTests(): number {
    return this.tasks.size;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  private assertNotShutdown(label: string): boolean {
    if (!this.shutdownFlag) return false;
    if (import.meta.env.DEV && !this.warnedShutdownOnce) {
      this.warnedShutdownOnce = true;
      logger.warn(`[scheduler] schedule call after shutdown ignored: ${label}`);
    }
    return true;
  }

  private bindAbort(signal: AbortSignal | undefined, handle: TaskHandle): void {
    if (!signal) return;
    if (signal.aborted) {
      this.cancel(handle);
      return;
    }
    signal.addEventListener("abort", () => this.cancel(handle), { once: true });
  }

  private startTask(record: TimeoutTaskRecord | IntervalTaskRecord): void {
    if (this.isPaused(record)) return;
    record.startedAt = Date.now();
    if (record.kind === "timeout") {
      record.timerId = globalThis.setTimeout(record.fn, record.remainingMs);
    } else {
      // interval: first tick after remainingMs, then steady delayMs
      record.timerId = globalThis.setTimeout(() => {
        record.fn();
        if (this.tasks.has(record.handle)) {
          record.remainingMs = record.delayMs;
          record.timerId = globalThis.setInterval(record.fn, record.delayMs);
        }
      }, record.remainingMs);
    }
  }

  private startIdleTask(record: IdleTaskRecord, timeoutMs: number): void {
    if (this.isPaused(record)) return;
    record.startedAt = Date.now();
    const w = globalThis as IdleWindow;
    if (typeof w.requestIdleCallback === "function") {
      record.idleId = w.requestIdleCallback(record.fn, { timeout: timeoutMs });
    } else {
      record.timerId = globalThis.setTimeout(record.fn, record.remainingMs);
    }
  }

  private stopTask(record: TaskRecord): void {
    if (record.timerId !== null) {
      if (record.kind === "interval") {
        globalThis.clearInterval(record.timerId as ReturnType<typeof globalThis.setInterval>);
      } else {
        globalThis.clearTimeout(record.timerId as ReturnType<typeof globalThis.setTimeout>);
      }
      record.timerId = null;
    }
    if (record.kind === "idle" && record.idleId !== null) {
      const w = globalThis as IdleWindow;
      try { w.cancelIdleCallback?.(record.idleId); } catch { /* noop */ }
      record.idleId = null;
    }
  }

  private isPaused(record: TaskRecord): boolean {
    if (!record.pauseWhenHidden) return false;
    if (typeof document === "undefined") return false;
    return document.visibilityState === "hidden";
  }

  private onVisibilityChange(): void {
    if (typeof document === "undefined") return;
    const hidden = document.visibilityState === "hidden";
    for (const record of this.tasks.values()) {
      if (!record.pauseWhenHidden) continue;
      if (hidden) {
        if (record.timerId === null && (record.kind !== "idle" || record.idleId === null)) continue;
        // snapshot remaining delay
        const elapsed = Date.now() - record.startedAt;
        record.remainingMs = Math.max(0, record.remainingMs - elapsed);
        this.stopTask(record);
      } else {
        if (record.timerId !== null || (record.kind === "idle" && record.idleId !== null)) continue;
        if (record.kind === "idle") this.startIdleTask(record, 2000);
        else this.startTask(record);
      }
    }
  }
}

export const taskScheduler = new TaskScheduler();
