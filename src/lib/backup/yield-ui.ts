/**
 * Cooperative scheduler yield. Uses the modern `scheduler.yield()` when
 * available (Chromium 129+ / current Electron) and falls back to a
 * `setTimeout(0)` task. Safe to call inside Dexie transactions: Dexie
 * holds only the IDB lock, not the JS thread, so yielding lets paints
 * flush while the transaction stays open until its last awaited write
 * resolves.
 */
type SchedulerWithYield = { yield?: () => Promise<void> };

export function yieldUI(): Promise<void> {
  const sched = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
  if (sched && typeof sched.yield === "function") {
    return sched.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
