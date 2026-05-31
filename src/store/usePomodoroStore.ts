// ─────────────────────────────────────────────────────────────────────────────
// usePomodoroStore — Zustand atom for Pomodoro timer.
//
// Replaces the React `PomodoroProvider` split-context (tick / stable). The
// per-second `seconds` counter and the rarely-changing `mode/running/cycle`
// fields live in the same store; consumers scope re-renders via selectors
// (`usePomodoroStore(s => s.seconds)` re-runs only when `seconds` changes).
//
// Timer runs as a module-level singleton — started when `running` flips to
// true, cleared when it flips to false. No React mount required. Raw
// `setInterval` is whitelisted in eslint.config.js for tight engine code.
// ─────────────────────────────────────────────────────────────────────────────
import { create, type StateCreator } from "zustand";
import { addPomodoroEntry } from "@/lib/storage";
import { loadAppSettings } from "@/lib/app-settings";

export type PomodoroMode = "work" | "break" | "longBreak";

export interface PomodoroState {
  mode: PomodoroMode;
  seconds: number;
  running: boolean;
  cycleCount: number;
}

interface PomodoroStore extends PomodoroState {
  toggle: () => void;
  reset: () => void;
}

function initialSeconds(): number {
  return loadAppSettings().pomodoro.workMinutes * 60;
}

const createImpl: StateCreator<PomodoroStore> = (set, get) => ({
  mode: "work",
  seconds: initialSeconds(),
  running: false,
  cycleCount: 0,
  toggle: () => set({ running: !get().running }),
  reset: () => {
    const s = loadAppSettings().pomodoro;
    const mode = get().mode;
    const seconds =
      mode === "work"
        ? s.workMinutes * 60
        : mode === "longBreak"
          ? s.longBreakMinutes * 60
          : s.breakMinutes * 60;
    set({ running: false, seconds });
  },
});

export const usePomodoroStore = create<PomodoroStore>(createImpl);

// ─── Singleton tick loop ────────────────────────────────────────────────
// Module-level subscription, attached once. Starts a 1s interval whenever
// `running` becomes true and clears it on stop. Survives HMR (Vite keeps
// module state); idempotent if accidentally re-attached.
let _intervalId: number | null = null;
let _wired = false;
let _unsubscribe: (() => void) | null = null;
let _onBeforeUnload: (() => void) | null = null;

function clearTick(): void {
  if (_intervalId != null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function tick(): void {
  const { seconds, mode, cycleCount } = usePomodoroStore.getState();
  if (seconds > 1) {
    usePomodoroStore.setState({ seconds: seconds - 1 });
    return;
  }
  // Phase boundary.
  const s = loadAppSettings().pomodoro;
  if (mode === "work") {
    void addPomodoroEntry({ timestamp: Date.now(), type: "focus", durationMinutes: s.workMinutes });
    const newCycle = cycleCount + 1;
    const goLong = s.longBreakInterval > 0 && newCycle % s.longBreakInterval === 0;
    usePomodoroStore.setState({
      running: false,
      cycleCount: newCycle,
      mode: goLong ? "longBreak" : "break",
      seconds: (goLong ? s.longBreakMinutes : s.breakMinutes) * 60,
    });
  } else {
    const dur = mode === "longBreak" ? s.longBreakMinutes : s.breakMinutes;
    void addPomodoroEntry({ timestamp: Date.now(), type: "break", durationMinutes: dur });
    usePomodoroStore.setState({
      running: false,
      mode: "work",
      seconds: s.workMinutes * 60,
    });
  }
}

function wireTickLoop(): void {
  if (_wired) return;
  _wired = true;
  let last = usePomodoroStore.getState().running;
  if (last) _intervalId = window.setInterval(tick, 1000);
  // PR-G4 / M-8: capture the unsubscribe so tests can fully tear down the
  // listener. Without this, repeated test runs (or future HMR cycles) would
  // stack duplicate subscribers — each calling `clearTick`/`setInterval` on
  // every `running` flip, producing phantom ticks.
  _unsubscribe = usePomodoroStore.subscribe((state) => {
    if (state.running === last) return;
    last = state.running;
    clearTick();
    if (last) _intervalId = window.setInterval(tick, 1000);
  });
  // Browser/Electron lifecycle: clear timer on unload.
  if (typeof window !== "undefined") {
    _onBeforeUnload = clearTick;
    window.addEventListener("beforeunload", _onBeforeUnload);
  }
}

// Wire on first import (in browser only — tests / SSR probes skip).
if (typeof window !== "undefined") {
  wireTickLoop();
}

// ─── Test helper ────────────────────────────────────────────────────────
export function __resetPomodoroStoreForTests(): void {
  clearTick();
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  if (_onBeforeUnload && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", _onBeforeUnload);
    _onBeforeUnload = null;
  }
  _wired = false;
  usePomodoroStore.setState({
    mode: "work",
    seconds: initialSeconds(),
    running: false,
    cycleCount: 0,
  });
}
