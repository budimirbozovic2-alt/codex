/**
 * PR-G8 — Shared test timing helpers (RC-8/RC-9).
 *
 * Replaces ad-hoc `const tick = (ms) => new Promise(r => setTimeout(r, ms))`
 * and inline `await new Promise(r => setTimeout(r, 0))` patterns scattered
 * across the suite. Centralizing makes intent explicit and lets us swap the
 * impl (e.g. for fake timers) in one place.
 */

/** Yield once to the microtask queue. Use when awaiting a settled Promise
 *  whose .then handlers must run before the next assertion. */
export const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => queueMicrotask(resolve));

/** Yield N macrotask cycles. Use when polling for an effect that may
 *  schedule another `setTimeout(0)` chain. Default 1 cycle. */
export const flushMacrotasks = async (cycles = 1): Promise<void> => {
  for (let i = 0; i < cycles; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

/** Wait for a real wall-clock interval. Prefer flushMicrotasks/flushMacrotasks
 *  unless the code under test legitimately depends on elapsed time. */
export const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
