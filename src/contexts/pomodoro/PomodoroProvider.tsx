/**
 * Provider Cleanup v2 — `PomodoroProvider` is a no-op shim. State and
 * timer live in `@/store/usePomodoroStore`. Consumer hooks scope re-renders
 * via Zustand selectors (no split-context plumbing).
 *
 * Public API preserved 1:1 for back-compat:
 *   - usePomodoroStable() — mode + running + cycleCount + toggle + reset
 *   - usePomodoroTick()   — seconds (re-renders only when seconds change)
 *   - usePomodoroContext() — composite (legacy)
 */
import type { ReactNode } from "react";
import { usePomodoroStore, type PomodoroState } from "@/store/usePomodoroStore";

export type { PomodoroState };

export function usePomodoroStable() {
  const mode = usePomodoroStore((s) => s.mode);
  const running = usePomodoroStore((s) => s.running);
  const cycleCount = usePomodoroStore((s) => s.cycleCount);
  const toggle = usePomodoroStore((s) => s.toggle);
  const reset = usePomodoroStore((s) => s.reset);
  return { mode, running, cycleCount, toggle, reset };
}

export function usePomodoroTick() {
  const seconds = usePomodoroStore((s) => s.seconds);
  return { seconds };
}

export function usePomodoroContext() {
  const stable = usePomodoroStable();
  const tick = usePomodoroTick();
  return {
    pomodoro: {
      mode: stable.mode,
      seconds: tick.seconds,
      running: stable.running,
      cycleCount: stable.cycleCount,
    } as PomodoroState,
    pomodoroToggle: stable.toggle,
    pomodoroReset: stable.reset,
  };
}

/** @deprecated Provider removed in v2 cleanup. Kept as no-op shim. */
export function PomodoroProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
