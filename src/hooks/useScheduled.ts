// PR-G4 — React wrappers around `taskScheduler` so components never reach
// for raw `setTimeout`/`setInterval`. Each hook registers the underlying
// task in `useEffect` and cancels it in cleanup, eliminating the "timer
// outlives unmount" class of bug. Empty `deps` is the common case (fire
// once on mount, cancel on unmount); pass `deps` when the timer needs to
// reset on prop/state change.
import { useEffect } from "react";
import { taskScheduler } from "@/lib/scheduler";

type EffectDeps = ReadonlyArray<unknown>;

/**
 * One-shot timeout scoped to component lifecycle. The handler captured at
 * the time `deps` last changed is the one that fires; pass `fn` via a ref
 * if you need an always-fresh closure.
 */
export function useScheduledTimeout(
  fn: () => void,
  ms: number,
  label: string,
  deps: EffectDeps = [],
): void {
  // `fn`/`label` are intentionally not in deps — callers control lifetime
  // via `deps`. This matches the semantics of `useEffect(() => { … }, deps)`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handle = taskScheduler.setTimeout(fn, ms, { label });
    return () => taskScheduler.cancel(handle);
  }, deps);
}

/**
 * Recurring interval scoped to component lifecycle. Same dep semantics as
 * `useScheduledTimeout`.
 */
export function useScheduledInterval(
  fn: () => void,
  ms: number,
  label: string,
  deps: EffectDeps = [],
): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handle = taskScheduler.setInterval(fn, ms, { label });
    return () => taskScheduler.cancel(handle);
  }, deps);
}
