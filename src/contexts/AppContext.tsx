import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCards } from "@/hooks/useCards";
import { Card } from "@/lib/spaced-repetition";
import { recordAppEntry, recordFirstAction, addActivityEntry, ActivityType } from "@/lib/metacognitive-storage";
import { addPomodoroEntry } from "@/lib/storage";
import { loadAppSettings } from "@/lib/app-settings";

// ─── Types ──────────────────────────────────────────────
export type View = "dashboard" | "create" | "edit" | "cards" | "review" | "categories" | "learn" | "settings" | "frequent-errors" | "knowledge-map" | "mnemonic" | "major-system-settings" | "metacognitive" | "stats" | "planner" | "database" | "speed-reader";

const VIEW_TO_PATH: Record<View, string> = {
  dashboard: "/", create: "/create", edit: "/edit", cards: "/database", review: "/review",
  categories: "/database", learn: "/learn", settings: "/settings", database: "/database",
  "frequent-errors": "/frequent-errors", "knowledge-map": "/knowledge-map",
  mnemonic: "/mnemonic", "major-system-settings": "/major-system-settings",
  metacognitive: "/metacognitive", stats: "/stats", planner: "/planner",
  "speed-reader": "/speed-reader",
};

const PATH_TO_VIEW: Record<string, View> = {};
Object.entries(VIEW_TO_PATH).forEach(([view, path]) => { PATH_TO_VIEW[path] = view as View; });

export function useCurrentView(): View {
  const { pathname } = useLocation();
  return PATH_TO_VIEW[pathname] || "dashboard";
}

const VIEW_ACTIVITY_MAP: Partial<Record<View, ActivityType>> = {
  review: "review", learn: "learn-active", mnemonic: "mnemonic-workshop",
  create: "admin", edit: "admin", categories: "admin",
  stats: "analysis", metacognitive: "analysis", planner: "analysis",
};

// ─── Pomodoro types ─────────────────────────────────────
export interface PomodoroState {
  mode: "work" | "break" | "longBreak";
  seconds: number;
  running: boolean;
  cycleCount: number;
}

// ═══════════════════════════════════════════════════════════
// CARD CONTEXT — data & mutations (re-renders only on card changes)
// ═══════════════════════════════════════════════════════════
type CardContextValue = ReturnType<typeof useCards>;

const CardContext = createContext<CardContextValue | null>(null);

export function useCardContext() {
  const ctx = useContext(CardContext);
  if (!ctx) throw new Error("useCardContext must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// UI CONTEXT — navigation, editing (NO pomodoro — re-renders only on nav/edit)
// ═══════════════════════════════════════════════════════════
interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  editingCard: Card | null;
  setEditingCard: (c: Card | null) => void;
  handleToggleTag: (cardId: string, tag: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUIContext must be used within UIProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// POMODORO CONTEXT — isolated timer (re-renders only PomodoroTimer)
// ═══════════════════════════════════════════════════════════
interface PomodoroContextValue {
  pomodoro: PomodoroState;
  pomodoroToggle: () => void;
  pomodoroReset: () => void;
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

export function usePomodoroContext() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoroContext must be used within PomodoroProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// BACKWARD-COMPAT: useAppContext merges card + ui (NOT pomodoro)
// ═══════════════════════════════════════════════════════════
type AppContextValue = CardContextValue & UIContextValue;

export function useAppContext(): AppContextValue {
  const card = useCardContext();
  const ui = useUIContext();
  return useMemo(() => ({ ...card, ...ui }), [card, ui]);
}

// ─── Pomodoro hook ──────────────────────────────────────
function useGlobalPomodoro() {
  const settingsRef = useRef(loadAppSettings().pomodoro);

  const refreshSettings = useCallback(() => {
    settingsRef.current = loadAppSettings().pomodoro;
  }, []);

  const [mode, setMode] = useState<"work" | "break" | "longBreak">("work");
  const [seconds, setSeconds] = useState(settingsRef.current.workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cycleRef = useRef(cycleCount);
  cycleRef.current = cycleCount;

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          setRunning(false);
          const s = settingsRef.current;
          if (modeRef.current === "work") {
            addPomodoroEntry({ timestamp: Date.now(), type: "focus", durationMinutes: s.workMinutes });
            const newCycle = cycleRef.current + 1;
            setCycleCount(newCycle);
            if (s.longBreakInterval > 0 && newCycle % s.longBreakInterval === 0) {
              setMode("longBreak");
              return s.longBreakMinutes * 60;
            } else {
              setMode("break");
              return s.breakMinutes * 60;
            }
          } else {
            const dur = modeRef.current === "longBreak" ? s.longBreakMinutes : s.breakMinutes;
            addPomodoroEntry({ timestamp: Date.now(), type: "break", durationMinutes: dur });
            setMode("work");
            return s.workMinutes * 60;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const toggle = useCallback(() => setRunning(r => !r), []);
  const reset = useCallback(() => {
    refreshSettings();
    const s = settingsRef.current;
    setRunning(false);
    if (modeRef.current === "work") setSeconds(s.workMinutes * 60);
    else if (modeRef.current === "longBreak") setSeconds(s.longBreakMinutes * 60);
    else setSeconds(s.breakMinutes * 60);
  }, [refreshSettings]);

  return useMemo(() => ({
    state: { mode, seconds, running, cycleCount } as PomodoroState,
    toggle,
    reset,
  }), [mode, seconds, running, cycleCount, toggle, reset]);
}

// ═══════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════

function CardProvider({ children }: { children: ReactNode }) {
  const cardsHook = useCards();
  return <CardContext.Provider value={cardsHook}>{children}</CardContext.Provider>;
}

function PomodoroProvider({ children }: { children: ReactNode }) {
  const pom = useGlobalPomodoro();
  const value = useMemo<PomodoroContextValue>(() => ({
    pomodoro: pom.state,
    pomodoroToggle: pom.toggle,
    pomodoroReset: pom.reset,
  }), [pom]);
  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}

function UIProvider({ children }: { children: ReactNode }) {
  const { toggleTag } = useCardContext();
  const navigate = useNavigate();
  const view = useCurrentView();

  const [editingCard, setEditingCard] = useState<Card | null>(null);

  // Record app entry on mount
  useEffect(() => { recordAppEntry(); }, []);

  // Notification reminder scheduler
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    let lastSentDate = "";
    const check = () => {
      const settings = loadAppSettings();
      if (!settings.notifications.enabled) return;
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (now.getHours() === settings.notifications.reminderHour && now.getMinutes() === settings.notifications.reminderMinute) {
        if (lastSentDate === todayKey) return; // Already sent today
        lastSentDate = todayKey;
        new Notification("Memoria — Podsjetnik", {
          body: "Vrijeme je za ponavljanje! Imaš kartice koje čekaju.",
          icon: `${import.meta.env.BASE_URL}placeholder.svg`,
        });
      }
    };
    const interval = window.setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  // Track first learning action
  useEffect(() => {
    if (view === "review" || view === "learn") recordFirstAction();
  }, [view]);

  // Auto time tracking per view
  useEffect(() => {
    const actType = VIEW_ACTIVITY_MAP[view];
    if (!actType) return;
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      if (duration > 5000) {
        addActivityEntry({ timestamp: start, type: actType, durationMs: duration });
      }
    };
  }, [view]);

  const setView = useCallback((v: View) => {
    navigate(VIEW_TO_PATH[v]);
  }, [navigate]);

  const handleToggleTag = useCallback((cardId: string, tag: string) => {
    toggleTag(cardId, tag);
  }, [toggleTag]);

  const value = useMemo<UIContextValue>(() => ({
    view, setView, editingCard, setEditingCard, handleToggleTag,
  }), [view, setView, editingCard, handleToggleTag]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// Combined provider — wraps all in correct order
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <CardProvider>
      <PomodoroProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </PomodoroProvider>
    </CardProvider>
  );
}
