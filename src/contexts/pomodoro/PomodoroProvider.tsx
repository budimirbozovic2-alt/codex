import { createContext, useContext, useMemo, ReactNode } from "react";
import { useGlobalPomodoro, type PomodoroState } from "./usePomodoroEngine";

/** R1 fix: Split Pomodoro into two contexts — tick (seconds, changes every second)
 *  and stable (mode, running, cycleCount, toggle, reset — changes rarely).
 *  This prevents sidebar/header re-renders every second. */
interface PomodoroStableValue {
  mode: PomodoroState["mode"];
  running: boolean;
  cycleCount: number;
  toggle: () => void;
  reset: () => void;
}
interface PomodoroTickValue {
  seconds: number;
}

const PomodoroStableContext = createContext<PomodoroStableValue | null>(null);
const PomodoroTickContext = createContext<PomodoroTickValue | null>(null);

/** Use this for mode/running/actions — does NOT re-render every second */
export function usePomodoroStable() {
  const ctx = useContext(PomodoroStableContext);
  if (!ctx) throw new Error("usePomodoroStable must be used within PomodoroProvider");
  return ctx;
}

/** Use this for seconds display — re-renders every second when running */
export function usePomodoroTick() {
  const ctx = useContext(PomodoroTickContext);
  if (!ctx) throw new Error("usePomodoroTick must be used within PomodoroProvider");
  return ctx;
}

/** Legacy compat — subscribes to BOTH (re-renders every second) */
export function usePomodoroContext() {
  const stable = usePomodoroStable();
  const tick = usePomodoroTick();
  return {
    pomodoro: { mode: stable.mode, seconds: tick.seconds, running: stable.running, cycleCount: stable.cycleCount } as PomodoroState,
    pomodoroToggle: stable.toggle,
    pomodoroReset: stable.reset,
  };
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const pom = useGlobalPomodoro();
  const stableValue = useMemo<PomodoroStableValue>(() => ({
    mode: pom.state.mode,
    running: pom.state.running,
    cycleCount: pom.state.cycleCount,
    toggle: pom.toggle,
    reset: pom.reset,
  }), [pom.state.mode, pom.state.running, pom.state.cycleCount, pom.toggle, pom.reset]);
  const tickValue = useMemo<PomodoroTickValue>(() => ({ seconds: pom.state.seconds }), [pom.state.seconds]);
  return (
    <PomodoroStableContext.Provider value={stableValue}>
      <PomodoroTickContext.Provider value={tickValue}>
        {children}
      </PomodoroTickContext.Provider>
    </PomodoroStableContext.Provider>
  );
}
