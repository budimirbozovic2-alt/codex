import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { taskScheduler } from "@/lib/scheduler";

describe("taskScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    taskScheduler.__resetForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    taskScheduler.__resetForTests();
  });

  it("setTimeout fires once and is removed from snapshot", () => {
    const fn = vi.fn();
    const h = taskScheduler.setTimeout(fn, 100, { label: "t:test" });
    expect(h).toBeGreaterThan(0);
    expect(taskScheduler.snapshot()).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(taskScheduler.snapshot()).toHaveLength(0);
  });

  it("cancel removes a pending task", () => {
    const fn = vi.fn();
    const h = taskScheduler.setTimeout(fn, 100, { label: "t:cancel" });
    taskScheduler.cancel(h);
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    expect(taskScheduler.snapshot()).toHaveLength(0);
  });

  it("setInterval fires repeatedly until cancelled", () => {
    const fn = vi.fn();
    const h = taskScheduler.setInterval(fn, 50, { label: "i:tick" });
    vi.advanceTimersByTime(160);
    // first tick at 50, then interval(50): 100, 150
    expect(fn).toHaveBeenCalledTimes(3);
    taskScheduler.cancel(h);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("debounce coalesces rapid calls into a single trailing invocation", () => {
    const fn = vi.fn();
    const d = taskScheduler.debounce(fn, 100, { label: "d:trail" });
    d("a"); d("b"); d("c");
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("debounce.flush invokes immediately with the latest args", () => {
    const fn = vi.fn();
    const d = taskScheduler.debounce(fn, 100, { label: "d:flush" });
    d(1); d(2);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it("cancelByLabel cancels all matching tasks", () => {
    taskScheduler.setTimeout(() => {}, 100, { label: "group:a" });
    taskScheduler.setTimeout(() => {}, 100, { label: "group:b" });
    taskScheduler.setTimeout(() => {}, 100, { label: "other:c" });
    const n = taskScheduler.cancelByLabel("group:");
    expect(n).toBe(2);
    expect(taskScheduler.snapshot()).toHaveLength(1);
  });

  it("shutdown clears everything and is idempotent", () => {
    taskScheduler.setTimeout(() => {}, 100, { label: "s:1" });
    taskScheduler.setInterval(() => {}, 100, { label: "s:2" });
    expect(taskScheduler.__sizeForTests()).toBe(2);
    taskScheduler.shutdown();
    expect(taskScheduler.__sizeForTests()).toBe(0);
    // second shutdown — no throw
    taskScheduler.shutdown();
    // post-shutdown scheduling is a no-op
    const h = taskScheduler.setTimeout(() => {}, 10, { label: "s:after" });
    expect(h).toBe(-1);
    expect(taskScheduler.__sizeForTests()).toBe(0);
  });

  it("AbortSignal cancels the scheduled task", () => {
    const fn = vi.fn();
    const ac = new AbortController();
    taskScheduler.setTimeout(fn, 100, { label: "a:abort", signal: ac.signal });
    ac.abort();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it("pauseWhenHidden marks task as paused in snapshot when hidden", () => {
    const fn = vi.fn();
    taskScheduler.setTimeout(fn, 100, { label: "p:hide", pauseWhenHidden: true });
    expect(taskScheduler.snapshot()[0]?.paused).toBe(false);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(taskScheduler.snapshot()[0]?.paused).toBe(true);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(taskScheduler.snapshot()[0]?.paused).toBe(false);
  });
});
