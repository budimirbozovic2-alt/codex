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
  mode: "work" | "break";
  seconds: number;
  running: boolean;
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
// UI CONTEXT — navigation, editing, pomodoro (re-renders independently)
// ═══════════════════════════════════════════════════════════
interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  editingCard: Card | null;
  setEditingCard: (c: Card | null) => void;
  handleToggleTag: (cardId: string, tag: string) => void;
  pomodoro: PomodoroState;
  pomodoroToggle: () => void;
  pomodoroReset: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUIContext must be used within UIProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// BACKWARD-COMPAT: useAppContext merges both
// ═══════════════════════════════════════════════════════════
type AppContextValue = CardContextValue & UIContextValue;

export function useAppContext(): AppContextValue {
  const card = useCardContext();
  const ui = useUIContext();
  return useMemo(() => ({ ...card, ...ui }), [card, ui]);
}

// ─── Pomodoro hook ──────────────────────────────────────
function useGlobalPomodoro() {
  const appSettings = loadAppSettings();
  const workDuration = appSettings.pomodoro.workMinutes;
  const breakDuration = appSettings.pomodoro.breakMinutes;

  const [mode, setMode] = useState<"work" | "break">("work");
  const [seconds, setSeconds] = useState(workDuration * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => {
        setSeconds(prev => {
          if (prev <= 1) {
            setRunning(false);
            if (mode === "work") {
              addPomodoroEntry({ timestamp: Date.now(), type: "focus", durationMinutes: workDuration });
              setMode("break");
              return breakDuration * 60;
            } else {
              addPomodoroEntry({ timestamp: Date.now(), type: "break", durationMinutes: breakDuration });
              setMode("work");
              return workDuration * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, workDuration, breakDuration]);

  const toggle = useCallback(() => setRunning(r => !r), []);
  const reset = useCallback(() => {
    setRunning(false);
    setSeconds(mode === "work" ? workDuration * 60 : breakDuration * 60);
  }, [mode, workDuration, breakDuration]);

  return useMemo(() => ({
    state: { mode, seconds, running } as PomodoroState,
    toggle,
    reset,
  }), [mode, seconds, running, toggle, reset]);
}

// ═══════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════

function CardProvider({ children }: { children: ReactNode }) {
  const cardsHook = useCards();
  return <CardContext.Provider value={cardsHook}>{children}</CardContext.Provider>;
}

function UIProvider({ children }: { children: ReactNode }) {
  const { cards, toggleTag } = useCardContext();
  const navigate = useNavigate();
  const view = useCurrentView();

  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const pom = useGlobalPomodoro();

  // Record app entry on mount
  useEffect(() => { recordAppEntry(); }, []);

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

  // Mnemonic cloning
  const handleToggleTag = useCallback((cardId: string, tag: string) => {
    toggleTag(cardId, tag);
  }, [toggleTag]);

  const value = useMemo<UIContextValue>(() => ({
    view, setView, editingCard, setEditingCard,
    handleToggleTag,
    pomodoro: pom.state, pomodoroToggle: pom.toggle, pomodoroReset: pom.reset,
  }), [view, setView, editingCard, handleToggleTag, pom]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// Combined provider — wraps both in correct order
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <CardProvider>
      <UIProvider>
        {children}
      </UIProvider>
    </CardProvider>
  );
}
