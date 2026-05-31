// PR-G4 — React wrappers around `taskScheduler` so components never reach
// for raw `setTimeout`/`setInterval`. Each hook registers the underlying
// task in `useEffect` and cancels it in cleanup, eliminating the "timer
// outlives unmount" class of bug. Empty `deps` is the common case (fire
// once on mount, cancel on unmount); pass `deps` when the timer needs to
// reset on prop/state change.
//
// `fn`/`label`/`ms` are intentionally NOT tracked in the dependency array
// — callers control lifetime explicitly via `deps`, mirroring the
// semantics of `useEffect(() => { … }, deps)`. Pass `fn` through a ref if
// you need an always-fresh closure without resetting the timer.
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { taskScheduler } from "@/lib/scheduler";

type EffectDeps = ReadonlyArray<unknown>;

export function useScheduledTimeout(
  fn: () => void,
  ms: number,
  label: string,
  deps: EffectDeps = [],
): void {
  useEffect(() => {
    const handle = taskScheduler.setTimeout(fn, ms, { label });
    return () => taskScheduler.cancel(handle);
  }, deps);
}

export function useScheduledInterval(
  fn: () => void,
  ms: number,
  label: string,
  deps: EffectDeps = [],
): void {
  useEffect(() => {
    const handle = taskScheduler.setInterval(fn, ms, { label });
    return () => taskScheduler.cancel(handle);
  }, deps);
}
