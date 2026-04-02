import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, ReactNode, Suspense, lazy } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCards } from "@/hooks/useCards";
import { Card } from "@/lib/spaced-repetition";
import { recordAppEntry, recordFirstAction, addActivityEntry, ActivityType } from "@/lib/metacognitive-storage";
import { addPomodoroEntry } from "@/lib/storage";
import { loadAppSettings } from "@/lib/app-settings";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─── Types ──────────────────────────────────────────────
export type View = "dashboard" | "create" | "edit" | "review" | "categories" | "learn" | "settings" | "frequent-errors" | "knowledge-map" | "mnemonic" | "metacognitive" | "stats" | "planner" | "speed-reader";

const VIEW_TO_PATH: Record<View, string> = {
  dashboard: "/", create: "/create", edit: "/edit", review: "/review",
  categories: "/categories", learn: "/learn", settings: "/settings",
  "frequent-errors": "/frequent-errors", "knowledge-map": "/knowledge-map",
  mnemonic: "/mnemonics",
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
// CARD STATE CONTEXT — cards, dueCards, stats (re-renders on card mutations)
// ═══════════════════════════════════════════════════════════
interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: ReturnType<typeof import("@/lib/spaced-repetition").getStats>;
  cardCountByCategory: Record<string, number>;
  ready: boolean;
  dbError: { type: string; message: string } | null;
}

const CardStateContext = createContext<CardStateContextValue | null>(null);

export function useCardData() {
  const ctx = useContext(CardStateContext);
  if (!ctx) throw new Error("useCardData must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// CATEGORY STATE CONTEXT — categoryRecords, subcategories, categoryStats
// ═══════════════════════════════════════════════════════════
interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: import("@/lib/db").CategoryRecord[];
  subcategories: Record<string, string[]>;
  categoryStats: Record<string, ReturnType<typeof import("@/lib/spaced-repetition").getCategoryStats>>;
}

const CategoryStateContext = createContext<CategoryStateContextValue | null>(null);

export function useCategoryData() {
  const ctx = useContext(CategoryStateContext);
  if (!ctx) throw new Error("useCategoryData must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// REVIEW STATE CONTEXT — reviewLog, srSettings
// ═══════════════════════════════════════════════════════════
interface ReviewStateContextValue {
  reviewLog: import("@/lib/storage").ReviewLogEntry[];
  srSettings: import("@/lib/spaced-repetition").SRSettings;
}

const ReviewStateContext = createContext<ReviewStateContextValue | null>(null);

export function useReviewData() {
  const ctx = useContext(ReviewStateContext);
  if (!ctx) throw new Error("useReviewData must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// CARD ACTIONS CONTEXT — stable refs (never re-renders on data changes)
// ═══════════════════════════════════════════════════════════
interface CardActionsContextValue {
  patchCard: ReturnType<typeof useCards>["patchCard"];
  addCard: ReturnType<typeof useCards>["addCard"];
  addFlashCard: ReturnType<typeof useCards>["addFlashCard"];
  updateCard: ReturnType<typeof useCards>["updateCard"];
  deleteCard: ReturnType<typeof useCards>["deleteCard"];
  splitCard: ReturnType<typeof useCards>["splitCard"];
  bulkAddCards: ReturnType<typeof useCards>["bulkAddCards"];
  reviewSection: ReturnType<typeof useCards>["reviewSection"];
  markRead: ReturnType<typeof useCards>["markRead"];
  toggleTag: ReturnType<typeof useCards>["toggleTag"];
  addKeyPart: ReturnType<typeof useCards>["addKeyPart"];
  bulkFlagNeedsReview: ReturnType<typeof useCards>["bulkFlagNeedsReview"];
  bulkUpdateSubcategory: ReturnType<typeof useCards>["bulkUpdateSubcategory"];
  bulkUpdateChapter: ReturnType<typeof useCards>["bulkUpdateChapter"];
  
  logError: ReturnType<typeof useCards>["logError"];
  clearErrorLog: ReturnType<typeof useCards>["clearErrorLog"];
  exportData: ReturnType<typeof useCards>["exportData"];
  exportTemplate: ReturnType<typeof useCards>["exportTemplate"];
  importData: ReturnType<typeof useCards>["importData"];
  importCards: ReturnType<typeof useCards>["importCards"];
  addCategory: ReturnType<typeof useCards>["addCategory"];
  renameCategory: ReturnType<typeof useCards>["renameCategory"];
  deleteCategory: ReturnType<typeof useCards>["deleteCategory"];
  addSubcategory: ReturnType<typeof useCards>["addSubcategory"];
  renameSubcategory: ReturnType<typeof useCards>["renameSubcategory"];
  deleteSubcategory: ReturnType<typeof useCards>["deleteSubcategory"];
  addChapter: ReturnType<typeof useCards>["addChapter"];
  renameChapter: ReturnType<typeof useCards>["renameChapter"];
  deleteChapter: ReturnType<typeof useCards>["deleteChapter"];
  reorderCategories: ReturnType<typeof useCards>["reorderCategories"];
  reorderSubcategories: ReturnType<typeof useCards>["reorderSubcategories"];
  reorderChapters: ReturnType<typeof useCards>["reorderChapters"];
  updateSRSettings: ReturnType<typeof useCards>["updateSRSettings"];
}

const CardActionsContext = createContext<CardActionsContextValue | null>(null);

export function useCardActions() {
  const ctx = useContext(CardActionsContext);
  if (!ctx) throw new Error("useCardActions must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// UI CONTEXT — navigation, editing (NO pomodoro)
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
// POMODORO CONTEXT — isolated timer
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
            void addPomodoroEntry({ timestamp: Date.now(), type: "focus", durationMinutes: s.workMinutes });
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
            void addPomodoroEntry({ timestamp: Date.now(), type: "break", durationMinutes: dur });
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
  const h = useCards();

  // B1 fix: Ref-based stable actions — context value never changes reference
  const actionsRef = useRef<CardActionsContextValue>(null!);
  actionsRef.current = {
    patchCard: h.patchCard,
    addCard: h.addCard, addFlashCard: h.addFlashCard, updateCard: h.updateCard,
    deleteCard: h.deleteCard, splitCard: h.splitCard, bulkAddCards: h.bulkAddCards,
    reviewSection: h.reviewSection,
    markRead: h.markRead, toggleTag: h.toggleTag, addKeyPart: h.addKeyPart,
    bulkFlagNeedsReview: h.bulkFlagNeedsReview, bulkUpdateSubcategory: h.bulkUpdateSubcategory,
    bulkUpdateChapter: h.bulkUpdateChapter,
    logError: h.logError, clearErrorLog: h.clearErrorLog,
    exportData: h.exportData, exportTemplate: h.exportTemplate,
    importData: h.importData, importCards: h.importCards,
    addCategory: h.addCategory, renameCategory: h.renameCategory, deleteCategory: h.deleteCategory,
    addSubcategory: h.addSubcategory, renameSubcategory: h.renameSubcategory, deleteSubcategory: h.deleteSubcategory,
    addChapter: h.addChapter, renameChapter: h.renameChapter, deleteChapter: h.deleteChapter,
    reorderCategories: h.reorderCategories, reorderSubcategories: h.reorderSubcategories,
    reorderChapters: h.reorderChapters,
    updateSRSettings: h.updateSRSettings,
  };

  const actionKeys = useMemo(() => Object.keys(actionsRef.current) as (keyof CardActionsContextValue)[], []);
  const actions = useMemo<CardActionsContextValue>(() => new Proxy({} as CardActionsContextValue, {
    get: (_target, prop: string) => (actionsRef.current as unknown as Record<string, unknown>)[prop],
    ownKeys: () => actionKeys,
    getOwnPropertyDescriptor: (_target, prop) =>
      actionKeys.includes(prop as keyof CardActionsContextValue)
        ? { configurable: true, enumerable: true, writable: true, value: (actionsRef.current as unknown as Record<string, unknown>)[prop as string] }
        : undefined,
  }), [actionKeys]);

  // Split data into 3 granular contexts
  const cardState = useMemo<CardStateContextValue>(() => ({
    cards: h.cards, dueCards: h.dueCards, stats: h.stats,
    cardCountByCategory: h.cardCountByCategory, ready: h.ready, dbError: h.dbError,
  }), [h.cards, h.dueCards, h.stats, h.cardCountByCategory, h.ready, h.dbError]);

  const categoryState = useMemo<CategoryStateContextValue>(() => ({
    categories: h.categories, categoryRecords: h.categoryRecords,
    subcategories: h.subcategories, categoryStats: h.categoryStats,
  }), [h.categories, h.categoryRecords, h.subcategories, h.categoryStats]);

  const reviewState = useMemo<ReviewStateContextValue>(() => ({
    reviewLog: h.reviewLog, srSettings: h.srSettings,
  }), [h.reviewLog, h.srSettings]);

  // H5 fix: Render recovery panel but still wrap in providers
  if (h.dbError) {
    return (
      <CardActionsContext.Provider value={actions}>
        <CardStateContext.Provider value={cardState}>
          <CategoryStateContext.Provider value={categoryState}>
            <ReviewStateContext.Provider value={reviewState}>
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground">Učitavanje...</div>}>
                <LazyDatabaseRecoveryPanel error={h.dbError} />
              </Suspense>
            </ReviewStateContext.Provider>
          </CategoryStateContext.Provider>
        </CardStateContext.Provider>
      </CardActionsContext.Provider>
    );
  }

  return (
    <CardActionsContext.Provider value={actions}>
      <CardStateContext.Provider value={cardState}>
        <CategoryStateContext.Provider value={categoryState}>
          <ReviewStateContext.Provider value={reviewState}>
            {children}
          </ReviewStateContext.Provider>
        </CategoryStateContext.Provider>
      </CardStateContext.Provider>
    </CardActionsContext.Provider>
  );
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
  const { toggleTag } = useCardActions();
  const navigate = useNavigate();
  const view = useCurrentView();

  const [editingCard, setEditingCard] = useState<Card | null>(null);

  useEffect(() => { recordAppEntry(); }, []);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    let lastSentDate = "";
    const cachedNotif = loadAppSettings().notifications;
    const settingsRef = { enabled: cachedNotif.enabled, hour: cachedNotif.reminderHour, minute: cachedNotif.reminderMinute };

    const refreshSettings = () => {
      const s = loadAppSettings().notifications;
      settingsRef.enabled = s.enabled;
      settingsRef.hour = s.reminderHour;
      settingsRef.minute = s.reminderMinute;
    };

    const check = () => {
      if (!settingsRef.enabled) return;
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (now.getHours() === settingsRef.hour && now.getMinutes() === settingsRef.minute) {
        if (lastSentDate === todayKey) return;
        lastSentDate = todayKey;
        new Notification("Memoria — Podsjetnik", {
          body: "Vrijeme je za ponavljanje! Imaš kartice koje čekaju.",
          icon: `${import.meta.env.BASE_URL}placeholder.svg`,
        });
      }
    };

    const onVisChange = () => { if (document.visibilityState === "visible") refreshSettings(); };
    document.addEventListener("visibilitychange", onVisChange);
    const interval = window.setInterval(check, 60000);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisChange); };
  }, []);

  useEffect(() => {
    if (view === "review" || view === "learn") recordFirstAction();
  }, [view]);

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
